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

  if (isTrial(contract)) {
    const title =
      daysLeft === 0
        ? "Sua experiência gratuita vence hoje"
        : `Sua experiência gratuita vence em ${daysLeft} dia(s)`;

    const content =
      daysLeft === 0
        ? `Olá, ${name}. Sua experiência gratuita no Funcional Vip Digital vence hoje (${endDate}). Para continuar recebendo treinos e acompanhamento, fale com a equipe sobre os planos disponíveis.`
        : `Olá, ${name}. Sua experiência gratuita no Funcional Vip Digital termina em ${daysLeft} dia(s), no dia ${endDate}. Para continuar recebendo treinos e acompanhamento, fale com a equipe sobre os planos disponíveis.`;

    return {
      title,
      content,
      subject: title,
      text: content,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
          <h2>${title}</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Sua experiência gratuita termina em <strong>${endDate}</strong>.</p>
          <p>Para continuar recebendo treinos e acompanhamento, fale com a equipe sobre os planos disponíveis.</p>
          <p style="font-size: 12px; color: #666;">
            Enquanto sua experiência estiver ativa, seus treinos continuam disponíveis normalmente.
          </p>
        </div>
      `,
    };
  }

  const title =
    daysLeft === 0
      ? "Seu contrato vence hoje"
      : `Seu contrato vence em ${daysLeft} dia(s)`;

  const content =
    daysLeft === 0
      ? `Olá, ${name}. Seu contrato do Funcional Vip Digital vence hoje (${endDate}). Para não interromper o acompanhamento, fale com a equipe sobre a renovação.`
      : `Olá, ${name}. Seu contrato do Funcional Vip Digital vence em ${daysLeft} dia(s), no dia ${endDate}. Para não interromper o acompanhamento, fale com a equipe sobre a renovação.`;

  return {
    title,
    content,
    subject: title,
    text: content,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
        <h2>${title}</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Seu ${publicName} termina em <strong>${endDate}</strong>.</p>
        <p>Para não interromper seu acompanhamento, fale com a equipe sobre a renovação.</p>
      </div>
    `,
  };
}

function buildExpiredCopy(contract: ContractWithStudent) {
  const name = contract.student.name || "Aluno";
  const endDate = formatDate(contract.endDate);

  if (isTrial(contract)) {
    const title = "Sua experiência gratuita foi finalizada";
    const content = `Olá, ${name}. Sua experiência gratuita no Funcional Vip Digital terminou em ${endDate}. Para continuar recebendo novos treinos, escolha um plano com a equipe. Seu histórico continua salvo.`;

    return {
      title,
      content,
      subject: title,
      text: content,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
          <h2>${title}</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Sua experiência gratuita terminou em <strong>${endDate}</strong>.</p>
          <p>Para continuar recebendo novos treinos, escolha um plano com a equipe.</p>
          <p>Seu histórico continua salvo.</p>
        </div>
      `,
    };
  }

  const title = "Seu contrato foi finalizado";
  const content = `Olá, ${name}. Seu contrato do Funcional Vip Digital terminou em ${endDate}. Para continuar recebendo novos treinos, fale com a equipe sobre renovação. Seu histórico continua salvo.`;

  return {
    title,
    content,
    subject: title,
    text: content,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
        <h2>${title}</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Seu contrato terminou em <strong>${endDate}</strong>.</p>
        <p>Para continuar recebendo novos treinos, fale com a equipe sobre renovação.</p>
        <p>Seu histórico continua salvo.</p>
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
