import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseDate(value?: string | null): Date {
  if (!value) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }

  return date;
}

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function contractNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDatePtBr(value?: Date | string | null): string {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoneyPtBr(cents?: number | null): string {
  const value = Number(cents || 0) / 100;

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function paymentStatusLabel(status?: string | null): string {
  const value = String(status || "").toUpperCase();

  const labels: Record<string, string> = {
    EM_ABERTO: "em aberto",
    PAGO: "pago",
    PARCIAL: "parcial",
    ATRASADO: "atrasado",
    CANCELADO: "cancelado",
  };

  return labels[value] || value.toLowerCase();
}

async function getStudentEmail(student: {
  email?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
  if (student.email) return student.email;

  if (!student.userAuthId) return null;

  const userAuth = await prisma.user.findUnique({
    where: {
      id: student.userAuthId,
    },
    select: {
      email: true,
    },
  });

  return userAuth?.email || null;
}

async function notifyStudentAboutConversion({
  paidContract,
  payment,
  authorId,
}: {
  paidContract: any;
  payment: any;
  authorId: string;
}) {
  const isPaid = String(payment?.status || "").toUpperCase() === "PAGO";
  const student = paidContract.student;
  const studentName = student?.name || "aluno";
  const planName = paidContract.plan?.name || "plano pago";
  const alunoUrl = getAppAlunoUrl();
  const paymentLinkUrl = payment?.paymentLinkUrl || null;
  const studentEmail = await getStudentEmail({
    email: student?.email,
    userAuthId: student?.userAuthId,
  });

  const title = isPaid
    ? "Sua continuidade está confirmada"
    : "Seu plano está pronto para continuar";

  const content = isPaid
    ? [
        `Oi, ${studentName}! Temos uma boa notícia.`,
        "",
        `Sua experiência foi convertida para o plano ${planName}, e o contrato já está ativo.`,
        `Novo período de acompanhamento: ${formatDatePtBr(paidContract.startDate)} a ${formatDatePtBr(paidContract.endDate)}.`,
        `Programação prevista: ${paidContract.workoutsPerWeek} treino(s) por semana e ${paidContract.workoutsPerMonth} treino(s) por mês.`,
        "",
        "Seu histórico, suas conversas e sua evolução continuam salvos. Você pode seguir acompanhando os treinos normalmente pelo painel.",
        "Para dúvidas de treino, use o chat da plataforma. Para assuntos financeiros, fale com a gestão pelo canal indicado por ela.",
        "",
        "Que bom seguir com você nessa jornada!",
        "Gestão do Funcional UP Digital",
        "Mensagem automática de confirmação enviada pela plataforma.",
      ].join("\n")
    : [
        `Oi, ${studentName}!`,
        "",
        `A gestão deixou seu plano ${planName} preparado para dar continuidade ao acompanhamento.`,
        `O pagamento ainda aparece como ${paymentStatusLabel(payment?.status)}.`,
        `Vencimento: ${formatDatePtBr(payment?.dueDate)}.`,
        `Valor: ${formatMoneyPtBr(payment?.amountCents)}.`,
        paymentLinkUrl ? `Link de pagamento: ${paymentLinkUrl}.` : null,
        "",
        "Assim que o pagamento for confirmado, o contrato será ativado e a continuidade ficará regularizada.",
        "Se você já realizou o pagamento, pode desconsiderar este lembrete e aguardar a atualização do sistema.",
        "Se precisar de ajuda com pagamento ou contratação, fale com a gestão. Para dúvidas de treino, continue usando o chat da plataforma.",
        "",
        "Gestão do Funcional UP Digital",
        "Mensagem automática de acompanhamento comercial enviada pela plataforma.",
      ]
        .filter(Boolean)
        .join("\n");

  const notificationTasks: Promise<unknown>[] = [
    prisma.notice.create({
      data: {
        title,
        content,
        type: "FINANCEIRO",
        targetRole: "STUDENT",
        authorId,
        studentId: student.id,
      },
    }),
  ];

  if (studentEmail) {
    const safeStudentName = escapeHtml(studentName);
    const safeTitle = escapeHtml(title);
    const safePlanName = escapeHtml(planName);
    const safeAlunoUrl = escapeHtml(alunoUrl);
    const safePaymentLinkUrl = paymentLinkUrl ? escapeHtml(paymentLinkUrl) : null;

    const text = `${content}\n\nAcessar meu painel: ${alunoUrl}`;

    const html = isPaid
      ? `
        <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
          <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
            <h2 style="color:#00A19C; margin:0 0 16px;">${safeTitle}</h2>
            <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>! Temos uma boa notícia.</p>
            <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Sua experiência foi convertida para o plano <strong style="color:#f5f5f5;">${safePlanName}</strong>, e seu contrato já está ativo.</p>
            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:16px 0;">
              <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Período: <strong style="color:#f5f5f5;">${formatDatePtBr(paidContract.startDate)} a ${formatDatePtBr(paidContract.endDate)}</strong></p>
              <p style="color:#d4d4d4; font-size:13px; margin:0;">Programação: <strong style="color:#f5f5f5;">${paidContract.workoutsPerWeek} treino(s) por semana</strong></p>
            </div>
            <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Seu histórico, suas conversas e sua evolução continuam salvos. Para dúvidas de treino, use o chat da plataforma.</p>
            <a href="${safeAlunoUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">Acessar meu painel</a>
            <p style="color:#d4d4d4; font-size:13px; margin-top:22px;">Gestão do Funcional UP Digital</p>
            <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de confirmação enviada pela plataforma.</p>
          </div>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
          <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
            <h2 style="color:#00A19C; margin:0 0 16px;">${safeTitle}</h2>
            <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
            <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">A gestão deixou seu plano <strong style="color:#f5f5f5;">${safePlanName}</strong> preparado para continuar o acompanhamento.</p>
            <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:16px 0;">
              <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Situação: <strong style="color:#f5f5f5;">${paymentStatusLabel(payment?.status)}</strong></p>
              <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Vencimento: <strong style="color:#f5f5f5;">${formatDatePtBr(payment?.dueDate)}</strong></p>
              <p style="color:#d4d4d4; font-size:13px; margin:0;">Valor: <strong style="color:#f5f5f5;">${formatMoneyPtBr(payment?.amountCents)}</strong></p>
            </div>
            <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Assim que o pagamento for confirmado, o contrato será ativado. Se você já pagou, pode desconsiderar este lembrete e aguardar a atualização.</p>
            ${safePaymentLinkUrl ? `<a href="${safePaymentLinkUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-bottom:12px;">Abrir pagamento</a>` : ""}
            <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se precisar de apoio financeiro, fale com a gestão. Para dúvidas de treino, use o chat da plataforma.</p>
            <a href="${safeAlunoUrl}" style="display:inline-block; color:#00A19C; font-weight:bold; font-size:13px; margin-top:8px;">Acessar meu painel</a>
            <p style="color:#d4d4d4; font-size:13px; margin-top:22px;">Gestão do Funcional UP Digital</p>
            <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de acompanhamento comercial enviada pela plataforma.</p>
          </div>
        </div>
      `;

    notificationTasks.push(
      sendEmail({
        to: studentEmail,
        subject: title,
        text,
        html,
      })
    );
  }

  await Promise.allSettled(notificationTasks);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();

    const trialContractId = String(body?.trialContractId || "").trim();
    const planId = String(body?.planId || "").trim();
    const durationMonths = Math.max(toInt(body?.durationMonths, 1), 1);
    const startDate = parseDate(body?.startDate);
    const endDate = addMonthsMinusOneDay(startDate, durationMonths);
    const priceCents = toInt(body?.priceCents, 0);
    const dueDate = parseDate(body?.dueDate);
    const paymentMethod = String(body?.paymentMethod || "PIX").toUpperCase();
    const paymentStatus = String(body?.paymentStatus || "EM_ABERTO").toUpperCase();
    const paymentLinkUrl = String(body?.paymentLinkUrl || "").trim() || null;
    const paymentNotes = String(body?.paymentNotes || "").trim() || null;
    const notes = String(body?.notes || "").trim() || null;

    if (!trialContractId) {
      return NextResponse.json(
        { error: "Selecione a experiência que será convertida." },
        { status: 400 }
      );
    }

    if (!planId) {
      return NextResponse.json(
        { error: "Selecione o plano pago." },
        { status: 400 }
      );
    }

    if (priceCents <= 0) {
      return NextResponse.json(
        { error: "Informe o valor do plano pago." },
        { status: 400 }
      );
    }

    if (!["EM_ABERTO", "PAGO", "PARCIAL"].includes(paymentStatus)) {
      return NextResponse.json(
        { error: "Para conversão, o pagamento deve ficar em aberto, parcial ou pago." },
        { status: 400 }
      );
    }

    const trial = await prisma.studentContract.findUnique({
      where: {
        id: trialContractId,
      },
      include: {
        student: true,
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        plan: true,
      },
    });

    if (!trial) {
      return NextResponse.json({ error: "Experiência não encontrada." }, { status: 404 });
    }

    if (trial.type !== "TRIAL") {
      return NextResponse.json(
        { error: "O contrato selecionado não é uma experiência grátis." },
        { status: 400 }
      );
    }

    if (trial.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "A experiência selecionada não está ativa." },
        { status: 400 }
      );
    }

    const paidPlan = await prisma.servicePlan.findUnique({
      where: {
        id: planId,
      },
    });

    if (!paidPlan || paidPlan.active === false) {
      return NextResponse.json(
        { error: "Plano pago não encontrado ou inativo." },
        { status: 404 }
      );
    }

    if (paidPlan.allowTrial) {
      return NextResponse.json(
        { error: "Selecione um plano pago, não o plano de experiência grátis." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const shouldActivateNow = paymentStatus === "PAGO";

      if (shouldActivateNow) {
        await tx.studentContract.updateMany({
          where: {
            studentId: trial.studentId,
            status: "ACTIVE",
          },
          data: {
            status: "FINALIZED",
            commercialStatus: "FINALIZADO",
            finalizedAt: new Date(),
          },
        });
      }

      const paidContract = await tx.studentContract.create({
        data: {
          studentId: trial.studentId,
          planId: paidPlan.id,
          professorId: trial.professorId,
          contractNumber: contractNumber("CTR"),
          type: "PAID",
          status: shouldActivateNow ? "ACTIVE" : "AWAITING_PAYMENT",
          commercialStatus: shouldActivateNow ? "CONTRATO_ATIVO" : "AGUARDANDO_PAGAMENTO",
          startDate,
          endDate,
          durationMonths,
          workoutsPerWeek: paidPlan.workoutsPerWeek,
          workoutsPerMonth: paidPlan.workoutsPerMonth,
          totalContractedWorkouts: paidPlan.workoutsPerMonth * durationMonths,
          priceCents,
          paymentMode: "UNICO",
          source: "CONVERSAO_EXPERIENCIA",
          notes: [
            "Contrato criado pela conversão da experiência gratuita.",
            `Experiência de origem: ${trial.contractNumber || trial.id}.`,
            notes || null,
          ]
            .filter(Boolean)
            .join("\n"),
          renewedFromContractId: trial.id,
          createdById: userId,
          acceptedAt: shouldActivateNow ? new Date() : null,
          activatedAt: shouldActivateNow ? new Date() : null,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userAuthId: true,
            },
          },
          plan: true,
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      const payment = await tx.contractPayment.create({
        data: {
          contractId: paidContract.id,
          studentId: trial.studentId,
          amountCents: priceCents,
          dueDate,
          paidAt: paymentStatus === "PAGO" ? new Date() : null,
          status: paymentStatus,
          method: paymentMethod,
          paymentLinkUrl,
          notes: paymentNotes,
          createdById: userId,
        },
      });

      if (shouldActivateNow) {
        await tx.student.update({
          where: {
            id: trial.studentId,
          },
          data: {
            commercialStatus: "CONTRATO_ATIVO",
            contractedTrainingDaysPerMonth: paidContract.workoutsPerMonth,
            ...(trial.professorId ? { userId: trial.professorId } : {}),
          },
        });
      }

      await tx.studentCareEvent.updateMany({
        where: {
          studentId: trial.studentId,
          eventType: "TRIAL_CONTINUATION_REQUEST",
          status: {
            in: ["ABERTO", "EM_ANDAMENTO", "PENDENTE"],
          },
        },
        data: {
          status: "RESOLVIDO",
          resolvedAt: new Date(),
          resolvedById: userId,
          resolutionNotes: shouldActivateNow
            ? "Experiência convertida para contrato pago ativo."
            : "Contrato pago criado e aguardando pagamento.",
        },
      });

      return {
        paidContract,
        payment,
        activatedNow: shouldActivateNow,
      };
    });

    try {
      await notifyStudentAboutConversion({
        paidContract: result.paidContract,
        payment: result.payment,
        authorId: userId,
      });
    } catch (notificationError) {
      console.error("Erro ao notificar aluno sobre conversão da experiência:", notificationError);
    }

    return NextResponse.json({
      ok: true,
      message: result.activatedNow
        ? "Experiência convertida em contrato pago, pagamento marcado como pago e aluno notificado."
        : "Contrato pago criado aguardando pagamento. A experiência permanece ativa até o pagamento ser confirmado ou até vencer. Aluno notificado sobre o pagamento.",
      contract: result.paidContract,
      payment: result.payment,
    });
  } catch (error: any) {
    console.error("POST /api/student-contracts/convert-trial error:", error);

    return NextResponse.json(
      {
        error: "Erro ao converter experiência.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
