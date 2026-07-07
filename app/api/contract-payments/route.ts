import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

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
}) {
  const status = String(contract.status || "").toUpperCase();
  const type = String(contract.type || "").toUpperCase();

  if (status === "ACTIVE") {
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
      commercialStatus: contract.type === "TRIAL" ? "EXPERIENCIA_ATIVA" : "CONTRATO_ATIVO",
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
      }),
      contractedTrainingDaysPerMonth: contract.workoutsPerMonth,
      ...(contract.professorId ? { userId: contract.professorId } : {}),
    },
  });

  return updatedContract;
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
