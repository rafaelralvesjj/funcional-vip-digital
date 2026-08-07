import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type ContractWithStudent = Awaited<ReturnType<typeof getActiveContractsForLifecycle>>[number];

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret =
    process.env.CRON_SECRET ||
    process.env.VERCEL_CRON_SECRET ||
    process.env.NEXT_PUBLIC_CRON_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorization = request.headers.get("authorization");

  return (
    headerSecret === configuredSecret ||
    querySecret === configuredSecret ||
    authorization === `Bearer ${configuredSecret}`
  );
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function endOfToday(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function daysUntil(date: Date | string): number {
  const start = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isTrial(contract: { type: string }): boolean {
  return String(contract.type || "").toUpperCase() === "TRIAL";
}

function contractPublicName(contract: { type: string }): string {
  return isTrial(contract) ? "experiência gratuita" : "contrato";
}

function endingEventKey(daysLeft: number): string {
  if (daysLeft === 7) return "D7";
  if (daysLeft === 3) return "D3";
  if (daysLeft === 0) return "D0";
  return `D${daysLeft}`;
}

async function getSystemAuthorId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: {
      active: true,
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  return user?.id || null;
}

async function refreshStudent(studentId: string) {
  const now = new Date();

  const activeContract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lte: now,
      },
      endDate: {
        gte: now,
      },
    },
    orderBy: {
      endDate: "desc",
    },
  });

  if (activeContract) {
    await prisma.student.update({
      where: {
        id: studentId,
      },
      data: {
        commercialStatus:
          activeContract.type === "TRIAL" ? "EXPERIENCIA_ATIVA" : "CONTRATO_ATIVO",
        contractedTrainingDaysPerMonth: activeContract.workoutsPerMonth,
        ...(activeContract.professorId ? { userId: activeContract.professorId } : {}),
      },
    });

    return;
  }

  const suspendedContract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: "SUSPENDED",
    },
    select: {
      id: true,
    },
  });

  await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      commercialStatus: suspendedContract ? "SUSPENSO_POR_PAGAMENTO" : "SEM_CONTRATO_ATIVO",
      contractedTrainingDaysPerMonth: suspendedContract ? undefined : null,
    },
  });
}

async function getActiveContractsForLifecycle() {
  const today = startOfToday();
  const inSevenDays = addDays(endOfToday(), 7);

  return prisma.studentContract.findMany({
    where: {
      status: "ACTIVE",
      endDate: {
        gte: today,
        lte: inSevenDays,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      plan: {
        select: {
          id: true,
          name: true,
        },
      },
      professor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      endDate: "asc",
    },
  });
}

async function createLifecycleEvent({
  contractId,
  studentId,
  eventType,
  eventKey,
}: {
  contractId: string;
  studentId: string;
  eventType: string;
  eventKey: string;
}) {
  try {
    return await prisma.contractLifecycleEvent.create({
      data: {
        contractId,
        studentId,
        eventType,
        eventKey,
        channel: "AVISO_EMAIL",
      },
    });
  } catch (error: any) {
    if (String(error?.code) === "P2002") {
      return null;
    }

    throw error;
  }
}

async function notifyStudent({
  contract,
  eventId,
  title,
  content,
  emailSubject,
  emailHtml,
  emailText,
  authorId,
}: {
  contract: ContractWithStudent;
  eventId: string;
  title: string;
  content: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
  authorId: string | null;
}) {
  let noticeId: string | null = null;

  if (authorId) {
    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        type: "CONTRACT_LIFECYCLE",
        targetRole: "ALUNO",
        studentId: contract.studentId,
        authorId,
        expiresAt: addDays(new Date(), 30),
      },
      select: {
        id: true,
      },
    });

    noticeId = notice.id;
  }

  let emailSentAt: Date | null = null;

  if (contract.student.email) {
    try {
      await sendEmail({
        to: contract.student.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
        eventType: "CONTRACT_LIFECYCLE_STUDENT",
        recipientType: "STUDENT",
        contextId: contract.student.id,
      });

      emailSentAt = new Date();
    } catch (error) {
      console.error("Erro ao enviar e-mail da régua de contrato:", error);
    }
  }

  await prisma.contractLifecycleEvent.update({
    where: {
      id: eventId,
    },
    data: {
      noticeId,
      emailSentAt,
    },
  });
}

function buildEndingCopy(contract: ContractWithStudent, daysLeft: number) {
  const name = contract.student.name || "Aluno";
  const publicName = contractPublicName(contract);
  const endDate = formatDate(contract.endDate);
  const loginUrl = getAppLoginUrl();
  const safeName = escapeHtml(name);
  const safeEndDate = escapeHtml(endDate);
  const safeLoginUrl = escapeHtml(loginUrl);
  const isToday = daysLeft === 0;

  if (isTrial(contract)) {
    const title = isToday
      ? "Sua experiência termina hoje — vamos falar sobre os próximos passos"
      : `Sua experiência entra na reta final: faltam ${daysLeft} dia(s)`;

    const content = [
      `Oi, ${name}!`,
      "",
      isToday
        ? `Sua experiência gratuita termina hoje, ${endDate}.`
        : `Sua experiência gratuita termina em ${daysLeft} dia(s), no dia ${endDate}.`,
      "Enquanto ela estiver ativa, seus treinos continuam disponíveis normalmente.",
      "Se você quiser continuar com o acompanhamento, sinalize seu interesse pelo painel ou fale com a gestão para conhecer as opções de plano.",
      "Seu histórico, suas conversas e sua evolução permanecem salvos.",
      "",
      "Gestão do Funcional UP Digital",
      "Mensagem automática de acompanhamento da sua experiência.",
    ].join("\n");

    return {
      title,
      content,
      subject: title,
      text: `${content}\n\nAcessar meu painel: ${loginUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
          <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
            <h2 style="color:#00A19C;margin:0 0 16px;">${escapeHtml(title)}</h2>
            <p style="color:#f5f5f5;font-size:15px;line-height:1.5;">Oi, <strong>${safeName}</strong>!</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${isToday ? `Sua experiência gratuita termina hoje, <strong style="color:#f5f5f5;">${safeEndDate}</strong>.` : `Sua experiência gratuita termina em <strong style="color:#f5f5f5;">${daysLeft} dia(s)</strong>, no dia <strong style="color:#f5f5f5;">${safeEndDate}</strong>.`}</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Enquanto ela estiver ativa, seus treinos continuam disponíveis normalmente. Se quiser continuar, sinalize pelo painel ou fale com a gestão para conhecer as opções.</p>
            <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Seu histórico, suas conversas e sua evolução permanecem salvos.</p>
            <a href="${safeLoginUrl}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Acessar meu painel</a>
            <p style="color:#d4d4d4;font-size:13px;margin-top:22px;">Gestão do Funcional UP Digital</p>
            <p style="color:#6b6b6b;font-size:11px;margin-top:4px;">Mensagem automática de acompanhamento da sua experiência.</p>
          </div>
        </div>
      `,
    };
  }

  const title = isToday
    ? "Seu ciclo atual termina hoje — vamos organizar a continuidade"
    : `Seu ciclo atual termina em ${daysLeft} dia(s)`;

  const content = [
    `Oi, ${name}!`,
    "",
    isToday
      ? `Seu ${publicName} termina hoje, ${endDate}.`
      : `Seu ${publicName} termina em ${daysLeft} dia(s), no dia ${endDate}.`,
    "Para manter o acompanhamento sem interrupção, fale com a gestão sobre a renovação.",
    "Se a renovação já foi combinada ou paga, pode desconsiderar este lembrete e aguardar a atualização do sistema.",
    "Seu histórico, suas conversas e sua evolução permanecem salvos.",
    "",
    "Gestão do Funcional UP Digital",
    "Mensagem automática de acompanhamento contratual.",
  ].join("\n");

  return {
    title,
    content,
    subject: title,
    text: `${content}\n\nAcessar meu painel: ${loginUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
          <h2 style="color:#00A19C;margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5;font-size:15px;line-height:1.5;">Oi, <strong>${safeName}</strong>!</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${isToday ? `Seu ${publicName} termina hoje, <strong style="color:#f5f5f5;">${safeEndDate}</strong>.` : `Seu ${publicName} termina em <strong style="color:#f5f5f5;">${daysLeft} dia(s)</strong>, no dia <strong style="color:#f5f5f5;">${safeEndDate}</strong>.`}</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Para manter o acompanhamento sem interrupção, fale com a gestão sobre a renovação. Se já estiver combinado ou pago, desconsidere e aguarde a atualização.</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Seu histórico, suas conversas e sua evolução permanecem salvos.</p>
          <a href="${safeLoginUrl}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Acessar meu painel</a>
          <p style="color:#d4d4d4;font-size:13px;margin-top:22px;">Gestão do Funcional UP Digital</p>
          <p style="color:#6b6b6b;font-size:11px;margin-top:4px;">Mensagem automática de acompanhamento contratual.</p>
        </div>
      </div>
    `,
  };
}

function buildExpiredCopy(contract: ContractWithStudent) {
  const name = contract.student.name || "Aluno";
  const endDate = formatDate(contract.endDate);
  const loginUrl = getAppLoginUrl();
  const safeName = escapeHtml(name);
  const safeEndDate = escapeHtml(endDate);
  const safeLoginUrl = escapeHtml(loginUrl);

  const title = isTrial(contract)
    ? "Sua experiência terminou, mas seu histórico continua salvo"
    : "Seu ciclo terminou, mas seu histórico continua com você";

  const content = [
    `Oi, ${name}!`,
    "",
    isTrial(contract)
      ? `Sua experiência gratuita terminou em ${endDate}.`
      : `Seu contrato terminou em ${endDate}.`,
    "A partir de agora, novos treinos ficam pausados até a contratação ou renovação, mas seu histórico, suas conversas e sua evolução continuam salvos.",
    isTrial(contract)
      ? "Se você quiser continuar, sinalize pelo painel ou fale com a gestão para conhecer as opções de plano."
      : "Para retomar o acompanhamento, fale com a gestão sobre a renovação.",
    "",
    "Gestão do Funcional UP Digital",
    "Mensagem automática de encerramento de ciclo.",
  ].join("\n");

  return {
    title,
    content,
    subject: title,
    text: `${content}\n\nAcessar meu painel: ${loginUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
          <h2 style="color:#00A19C;margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5;font-size:15px;line-height:1.5;">Oi, <strong>${safeName}</strong>!</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${isTrial(contract) ? `Sua experiência gratuita terminou em <strong style="color:#f5f5f5;">${safeEndDate}</strong>.` : `Seu contrato terminou em <strong style="color:#f5f5f5;">${safeEndDate}</strong>.`}</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">Novos treinos ficam pausados até a contratação ou renovação, mas seu histórico, suas conversas e sua evolução continuam salvos.</p>
          <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${isTrial(contract) ? "Se quiser continuar, sinalize pelo painel ou fale com a gestão para conhecer as opções." : "Para retomar o acompanhamento, fale com a gestão sobre a renovação."}</p>
          <a href="${safeLoginUrl}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Acessar meu painel</a>
          <p style="color:#d4d4d4;font-size:13px;margin-top:22px;">Gestão do Funcional UP Digital</p>
          <p style="color:#6b6b6b;font-size:11px;margin-top:4px;">Mensagem automática de encerramento de ciclo.</p>
        </div>
      </div>
    `,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const authorId = await getSystemAuthorId();

    const activeContracts = await getActiveContractsForLifecycle();

    let remindersCreated = 0;
    let remindersSkipped = 0;

    for (const contract of activeContracts) {
      const daysLeft = daysUntil(contract.endDate);

      if (![7, 3, 0].includes(daysLeft)) {
        continue;
      }

      const eventType = isTrial(contract) ? "TRIAL_ENDING" : "CONTRACT_ENDING";
      const eventKey = endingEventKey(daysLeft);

      const event = await createLifecycleEvent({
        contractId: contract.id,
        studentId: contract.studentId,
        eventType,
        eventKey,
      });

      if (!event) {
        remindersSkipped += 1;
        continue;
      }

      const copy = buildEndingCopy(contract, daysLeft);

      await notifyStudent({
        contract,
        eventId: event.id,
        title: copy.title,
        content: copy.content,
        emailSubject: copy.subject,
        emailHtml: copy.html,
        emailText: copy.text,
        authorId,
      });

      remindersCreated += 1;
    }

    const now = new Date();

    const expiredContracts = await prisma.studentContract.findMany({
      where: {
        status: "ACTIVE",
        endDate: {
          lt: now,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    let expiredFinalized = 0;
    let expiredNotificationsCreated = 0;

    for (const contract of expiredContracts) {
      await prisma.studentContract.update({
        where: {
          id: contract.id,
        },
        data: {
          status: "FINALIZED",
          commercialStatus: "FINALIZADO",
          finalizedAt: new Date(),
        },
      });

      await refreshStudent(contract.studentId);
      expiredFinalized += 1;

      const eventType = isTrial(contract) ? "TRIAL_EXPIRED" : "CONTRACT_EXPIRED";
      const event = await createLifecycleEvent({
        contractId: contract.id,
        studentId: contract.studentId,
        eventType,
        eventKey: "EXPIRED",
      });

      if (event) {
        const copy = buildExpiredCopy(contract);

        await notifyStudent({
          contract,
          eventId: event.id,
          title: copy.title,
          content: copy.content,
          emailSubject: copy.subject,
          emailHtml: copy.html,
          emailText: copy.text,
          authorId,
        });

        expiredNotificationsCreated += 1;
      }
    }

    const overduePayments = await prisma.contractPayment.findMany({
      where: {
        status: {
          in: ["EM_ABERTO", "PARCIAL"],
        },
        dueDate: {
          lt: startOfToday(),
        },
      },
      select: {
        id: true,
      },
    });

    if (overduePayments.length) {
      await prisma.contractPayment.updateMany({
        where: {
          id: {
            in: overduePayments.map((payment) => payment.id),
          },
        },
        data: {
          status: "ATRASADO",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      remindersCreated,
      remindersSkipped,
      expiredFinalized,
      expiredNotificationsCreated,
      overduePaymentsMarked: overduePayments.length,
    });
  } catch (error: any) {
    console.error("GET /api/cron/contracts-lifecycle error:", error);

    return NextResponse.json(
      {
        error: "Erro ao executar régua de contratos.",
        message: error?.message,
        code: error?.code,
      },
      { status: 500 }
    );
  }
}
