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

function parseDateTime(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isFutureStartDate(value?: Date | string | null): boolean {
  if (!value) return false;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  return startOfDay(date).getTime() > startOfDay(new Date()).getTime();
}

function normalizePayment(payment: any) {
  return {
    id: payment.id,
    contractId: payment.contractId,
    studentId: payment.studentId,
    studentName: payment.student?.name || payment.contract?.student?.name || "Aluno",
    studentEmail: payment.student?.email || payment.contract?.student?.email || null,
    contractNumber: payment.contract?.contractNumber || null,
    contractType: payment.contract?.type || null,
    contractStatus: payment.contract?.status || null,
    contractCommercialStatus: payment.contract?.commercialStatus || null,
    planName: payment.contract?.plan?.name || "Contrato sem plano",
    professorName: payment.contract?.professor?.name || payment.student?.user?.name || null,
    amountCents: payment.amountCents,
    dueDate: payment.dueDate,
    paidAt: payment.paidAt,
    status: payment.status,
    method: payment.method,
    provider: payment.provider,
    paymentLinkUrl: payment.paymentLinkUrl,
    externalReference: payment.externalReference,
    receiptUrl: payment.receiptUrl,
    notes: payment.notes,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function getStudentCommercialStatus(contract: {
  status: string;
  type: string;
  startDate?: Date | string | null;
}) {
  const status = String(contract.status || "").toUpperCase();
  const type = String(contract.type || "").toUpperCase();
  const startsInFuture = isFutureStartDate(contract.startDate || null);

  if (status === "ACTIVE") {
    if (startsInFuture) {
      return type === "TRIAL" ? "EXPERIENCIA_AGENDADA" : "CONTRATO_AGENDADO";
    }

    return type === "TRIAL" ? "EXPERIENCIA_ATIVA" : "CONTRATO_ATIVO";
  }

  if (status === "SUSPENDED") return "SUSPENSO_POR_PAGAMENTO";
  if (status === "AWAITING_PAYMENT") return "AGUARDANDO_PAGAMENTO";
  if (status === "AWAITING_ACCEPTANCE") return "AGUARDANDO_ACEITE";

  return "SEM_CONTRATO_ATIVO";
}

async function activateContractAfterPayment(tx: any, contractId: string) {
  const contract = await tx.studentContract.findUnique({
    where: {
      id: contractId,
    },
  });

  if (!contract) {
    throw new Error("Contrato não encontrado para ativação.");
  }

  const now = new Date();
  const startsInFuture = isFutureStartDate(contract.startDate);
  const nextCommercialStatus = startsInFuture
    ? contract.type === "TRIAL"
      ? "EXPERIENCIA_AGENDADA"
      : "CONTRATO_AGENDADO"
    : contract.type === "TRIAL"
      ? "EXPERIENCIA_ATIVA"
      : "CONTRATO_ATIVO";

  await tx.studentContract.updateMany({
    where: {
      studentId: contract.studentId,
      status: "ACTIVE",
      id: {
        not: contract.id,
      },
    },
    data: {
      status: "FINALIZED",
      commercialStatus: "FINALIZADO",
      finalizedAt: now,
    },
  });

  const updatedContract = await tx.studentContract.update({
    where: {
      id: contract.id,
    },
    data: {
      status: "ACTIVE",
      commercialStatus: nextCommercialStatus,
      activatedAt: contract.activatedAt || now,
      acceptedAt: contract.acceptedAt || now,
      finalizedAt: null,
      cancelledAt: null,
      suspendedAt: null,
    },
  });

  await tx.student.update({
    where: {
      id: contract.studentId,
    },
    data: {
      commercialStatus: getStudentCommercialStatus({
        status: "ACTIVE",
        type: contract.type,
        startDate: contract.startDate,
      }),
      contractedTrainingDaysPerMonth: contract.workoutsPerMonth,
      ...(contract.professorId ? { userId: contract.professorId } : {}),
    },
  });

  return updatedContract;
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

function formatDatePtBr(value?: Date | string | null): string {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(cents?: number | null): string {
  const value = Number(cents || 0) / 100;

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function getStudentAuthEmail(student: {
  email?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
  if (student.email) return student.email;

  if (!student.userAuthId) return null;

  const authUser = await prisma.user.findUnique({
    where: {
      id: student.userAuthId,
    },
    select: {
      email: true,
    },
  });

  return authUser?.email || null;
}

async function notifyPaymentStatusChange({
  paymentId,
  status,
  authorId,
  contractActivated,
}: {
  paymentId: string;
  status: string;
  authorId: string;
  contractActivated: boolean;
}) {
  if (!paymentId || !authorId) return;

  const normalizedStatus = String(status || "").toUpperCase();

  if (normalizedStatus !== "PAGO" && normalizedStatus !== "ATRASADO") {
    return;
  }

  const payment = await prisma.contractPayment.findUnique({
    where: { id: paymentId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userAuthId: true,
        },
      },
      contract: {
        include: {
          plan: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              userAuthId: true,
            },
          },
        },
      },
    },
  });

  if (!payment) return;

  const student = payment.student || payment.contract?.student;
  if (!student?.id) return;

  const studentName = student.name || "Aluno";
  const studentEmail = await getStudentAuthEmail(student);
  const planName = payment.contract?.plan?.name || "seu plano";
  const amountText = formatMoney(payment.amountCents);
  const dueDateText = formatDatePtBr(payment.dueDate);
  const paidAtText = formatDatePtBr(payment.paidAt || new Date());
  const loginUrl = getAppLoginUrl();
  const paymentLinkUrl = payment.paymentLinkUrl || null;
  const contractStartsInFuture = contractActivated && isFutureStartDate(payment.contract?.startDate || null);
  const contractStartDateText = formatDatePtBr(payment.contract?.startDate || null);

  const title = normalizedStatus === "PAGO"
    ? contractActivated
      ? contractStartsInFuture
        ? "Pagamento confirmado: seu contrato está agendado"
        : "Pagamento confirmado: acompanhamento ativo"
      : "Pagamento confirmado com sucesso"
    : "Vamos regularizar seu pagamento?";

  const content = normalizedStatus === "PAGO"
    ? [
        `Oi, ${studentName}! Pagamento confirmado.`,
        "",
        `Recebemos ${amountText}, referente ao plano ${planName}, em ${paidAtText}.`,
        contractActivated
          ? contractStartsInFuture
            ? `Seu contrato está confirmado e o acesso aos novos treinos começa em ${contractStartDateText}, respeitando a primeira janela segura de acompanhamento.`
            : "Seu contrato está ativo e seu acompanhamento segue normalmente."
          : "O pagamento foi registrado pela gestão e ficará disponível no seu histórico financeiro.",
        "",
        "Acesse o painel para acompanhar seus treinos e avisos. Para dúvidas de treino, use o chat da plataforma; para assuntos financeiros, fale com a gestão.",
        "",
        "Obrigado por continuar com a gente!",
        "Gestão do Funcional UP Digital",
        "Mensagem automática de confirmação de pagamento.",
      ].join("\n")
    : [
        `Oi, ${studentName}! Tudo bem?`,
        "",
        `O pagamento do plano ${planName}, no valor de ${amountText} e com vencimento em ${dueDateText}, ainda aparece como pendente no sistema.`,
        "Sabemos que imprevistos acontecem. Confira a situação quando puder e use o link abaixo para regularizar, caso esteja disponível.",
        paymentLinkUrl ? `Link de pagamento: ${paymentLinkUrl}.` : null,
        "",
        "Se você já realizou o pagamento, pode desconsiderar esta mensagem e aguardar a atualização. Se precisar de apoio, fale com a gestão.",
        "Enquanto a pendência permanecer, a liberação de novos treinos pode ser pausada conforme as regras do plano, mas seu histórico continua salvo.",
        "",
        "Gestão do Funcional UP Digital",
        "Mensagem automática de acompanhamento financeiro.",
      ]
        .filter(Boolean)
        .join("\n");

  await prisma.notice.create({
    data: {
      title,
      content,
      type: "PAYMENT",
      targetRole: "STUDENT",
      studentId: student.id,
      authorId,
      expiresAt: normalizedStatus === "PAGO" ? null : payment.dueDate,
    },
  });

  if (!studentEmail) return;

  const safeTitle = escapeHtml(title);
  const safeStudentName = escapeHtml(studentName);
  const safePlanName = escapeHtml(planName);
  const safeAmountText = escapeHtml(amountText);
  const safeDueDateText = escapeHtml(dueDateText);
  const safePaidAtText = escapeHtml(paidAtText);
  const safePaymentLinkUrl = paymentLinkUrl ? escapeHtml(paymentLinkUrl) : null;

  const html = normalizedStatus === "PAGO"
    ? `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#22D3EE; margin:0 0 16px;">${safeTitle}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>! Pagamento confirmado.</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Recebemos <strong style="color:#f5f5f5;">${safeAmountText}</strong>, referente ao plano <strong style="color:#f5f5f5;">${safePlanName}</strong>, em <strong style="color:#f5f5f5;">${safePaidAtText}</strong>.</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">${contractActivated ? contractStartsInFuture ? `Seu contrato está confirmado e o acesso aos novos treinos começa em ${contractStartDateText}, respeitando a primeira janela segura de acompanhamento.` : "Seu contrato está ativo e seu acompanhamento segue normalmente." : "O pagamento foi registrado pela gestão e ficará disponível no seu histórico financeiro."}</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para dúvidas de treino, use o chat da plataforma. Para assuntos financeiros, fale com a gestão.</p>
          <a href="${loginUrl}" style="display:inline-block; background:#22D3EE; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">Acessar meu painel</a>
          <p style="color:#d4d4d4; font-size:13px; margin-top:22px;">Gestão do Funcional UP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de confirmação de pagamento.</p>
        </div>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#22D3EE; margin:0 0 16px;">${safeTitle}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>! Tudo bem?</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">O pagamento do plano <strong style="color:#f5f5f5;">${safePlanName}</strong> ainda aparece como pendente no sistema.</p>
          <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:16px 0;">
            <p style="color:#d4d4d4; font-size:13px; margin:0 0 8px;">Valor: <strong style="color:#f5f5f5;">${safeAmountText}</strong></p>
            <p style="color:#d4d4d4; font-size:13px; margin:0;">Vencimento: <strong style="color:#f5f5f5;">${safeDueDateText}</strong></p>
          </div>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Sabemos que imprevistos acontecem. Confira quando puder. Se você já pagou, pode desconsiderar esta mensagem e aguardar a atualização.</p>
          ${safePaymentLinkUrl ? `<p><a href="${safePaymentLinkUrl}" style="display:inline-block; background:#22D3EE; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">Regularizar pagamento</a></p>` : ""}
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se precisar de apoio, fale com a gestão. Enquanto a pendência permanecer, a liberação de novos treinos pode ser pausada, mas seu histórico continua salvo.</p>
          <p style="color:#d4d4d4; font-size:13px; margin-top:22px;">Gestão do Funcional UP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de acompanhamento financeiro.</p>
        </div>
      </div>
    `;

  await sendEmail({
    to: studentEmail,
    subject: title,
    text: `${content}\n\nAcessar meu painel: ${loginUrl}`,
    html,
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (role === "STUDENT") {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const contractId = request.nextUrl.searchParams.get("contractId");
    const studentId = request.nextUrl.searchParams.get("studentId");

    const where: any = {};

    if (status && status !== "TODOS") {
      where.status = status;
    }

    if (contractId) {
      where.contractId = contractId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (role === "TEACHER") {
      where.OR = [
        {
          contract: {
            professorId: userId,
          },
        },
        {
          student: {
            userId,
          },
        },
      ];
    }

    const payments = await prisma.contractPayment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        contract: {
          include: {
            plan: true,
            professor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 500,
    });

    const normalizedPayments = payments.map(normalizePayment);
    const now = new Date();

    const receivedCents = normalizedPayments
      .filter((payment) => payment.status === "PAGO")
      .reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);

    const openCents = normalizedPayments
      .filter((payment) => ["EM_ABERTO", "PARCIAL"].includes(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);

    const overdueCents = normalizedPayments
      .filter((payment) => {
        const dueDate = new Date(payment.dueDate);
        return payment.status === "ATRASADO" || (payment.status === "EM_ABERTO" && dueDate < now);
      })
      .reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);

    return NextResponse.json({
      payments: normalizedPayments,
      metrics: {
        totalPayments: normalizedPayments.length,
        paidPayments: normalizedPayments.filter((payment) => payment.status === "PAGO").length,
        openPayments: normalizedPayments.filter((payment) => payment.status === "EM_ABERTO").length,
        overduePayments: normalizedPayments.filter((payment) => {
          const dueDate = new Date(payment.dueDate);
          return payment.status === "ATRASADO" || (payment.status === "EM_ABERTO" && dueDate < now);
        }).length,
        partialPayments: normalizedPayments.filter((payment) => payment.status === "PARCIAL").length,
        cancelledPayments: normalizedPayments.filter((payment) => payment.status === "CANCELADO").length,
        receivedCents,
        openCents,
        overdueCents,
      },
    });
  } catch (error: any) {
    console.error("GET /api/contract-payments error:", error);

    const message = String(error?.message || "");
    const code = String(error?.code || "");

    if (
      code === "P2021" ||
      code === "P2022" ||
      message.includes("contract_payments")
    ) {
      return NextResponse.json(
        {
          error:
            "A tabela de pagamentos ainda não existe no banco de produção. Rode o SQL TXT da Fase 2 no mesmo Neon usado pela Vercel.",
          message,
          code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Erro ao buscar pagamentos.",
        message,
        code,
      },
      { status: 500 }
    );
  }
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

    const contractId = String(body?.contractId || "").trim();
    const amountCents = toInt(body?.amountCents, 0);
    const dueDate = parseDate(body?.dueDate);
    const status = String(body?.status || "EM_ABERTO").toUpperCase();
    const method = String(body?.method || "PIX").toUpperCase();
    const provider = String(body?.provider || "").trim() || null;
    const paymentLinkUrl = String(body?.paymentLinkUrl || "").trim() || null;
    const externalReference = String(body?.externalReference || "").trim() || null;
    const receiptUrl = String(body?.receiptUrl || "").trim() || null;
    const notes = String(body?.notes || "").trim() || null;
    const activateContract = Boolean(body?.activateContract);

    if (!contractId) {
      return NextResponse.json({ error: "Contrato é obrigatório." }, { status: 400 });
    }

    if (amountCents <= 0) {
      return NextResponse.json({ error: "Valor do pagamento precisa ser maior que zero." }, { status: 400 });
    }

    if (!["EM_ABERTO", "PAGO", "ATRASADO", "PARCIAL", "CANCELADO"].includes(status)) {
      return NextResponse.json({ error: "Status do pagamento inválido." }, { status: 400 });
    }

    const contract = await prisma.studentContract.findUnique({
      where: {
        id: contractId,
      },
      select: {
        id: true,
        studentId: true,
        type: true,
        status: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.contractPayment.create({
        data: {
          contractId,
          studentId: contract.studentId,
          amountCents,
          dueDate,
          paidAt: status === "PAGO" ? new Date() : null,
          status,
          method,
          provider,
          paymentLinkUrl,
          externalReference,
          receiptUrl,
          notes,
          createdById: userId,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          contract: {
            include: {
              plan: true,
              professor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              student: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (status === "PAGO" && activateContract) {
        await activateContractAfterPayment(tx, contractId);
      }

      return created;
    });

    if (status === "PAGO" || status === "ATRASADO") {
      try {
        await notifyPaymentStatusChange({
          paymentId: payment.id,
          status,
          authorId: userId,
          contractActivated: status === "PAGO" && activateContract,
        });
      } catch (notificationError) {
        console.error("Erro ao notificar aluno sobre pagamento:", notificationError);
      }
    }

    return NextResponse.json({
      ok: true,
      payment: normalizePayment(payment),
    });
  } catch (error: any) {
    console.error("POST /api/contract-payments error:", error);

    return NextResponse.json(
      {
        error: "Erro ao criar pagamento.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const id = String(body?.id || "").trim();
    const status = String(body?.status || "").toUpperCase();
    const notes = typeof body?.notes === "string" ? body.notes.trim() : undefined;
    const paidAt = parseDateTime(body?.paidAt) || (status === "PAGO" ? new Date() : null);
    const activateContract = Boolean(body?.activateContract);

    if (!id) {
      return NextResponse.json({ error: "ID do pagamento é obrigatório." }, { status: 400 });
    }

    if (!["EM_ABERTO", "PAGO", "ATRASADO", "PARCIAL", "CANCELADO"].includes(status)) {
      return NextResponse.json({ error: "Status do pagamento inválido." }, { status: 400 });
    }

    const existing = await prisma.contractPayment.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        contractId: true,
        studentId: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractPayment.update({
        where: {
          id,
        },
        data: {
          status,
          paidAt: status === "PAGO" ? paidAt : null,
          ...(notes !== undefined ? { notes } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          contract: {
            include: {
              plan: true,
              professor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              student: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (status === "PAGO" && activateContract) {
        await activateContractAfterPayment(tx, existing.contractId);
      }

      return updated;
    });

    if ((status === "PAGO" || status === "ATRASADO") && existing.status !== status) {
      try {
        await notifyPaymentStatusChange({
          paymentId: payment.id,
          status,
          authorId: userId,
          contractActivated: status === "PAGO" && activateContract,
        });
      } catch (notificationError) {
        console.error("Erro ao notificar aluno sobre atualização de pagamento:", notificationError);
      }
    }

    return NextResponse.json({
      ok: true,
      payment: normalizePayment(payment),
    });
  } catch (error: any) {
    console.error("PUT /api/contract-payments error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar pagamento.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
