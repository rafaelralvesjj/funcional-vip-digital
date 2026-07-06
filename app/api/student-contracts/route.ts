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

function addMonthsMinusOneDay(startDate: Date, durationMonths: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(durationMonths, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function mapStudentCommercialStatus({
  status,
  type,
}: {
  status: string;
  type: string;
}): string {
  const normalizedStatus = String(status || "").toUpperCase();
  const normalizedType = String(type || "").toUpperCase();

  if (normalizedStatus === "ACTIVE") {
    return normalizedType === "TRIAL" ? "EXPERIENCIA_ATIVA" : "CONTRATO_ATIVO";
  }

  if (normalizedStatus === "SUSPENDED") {
    return "SUSPENSO_POR_PAGAMENTO";
  }

  if (normalizedStatus === "CANCELLED" || normalizedStatus === "FINALIZED") {
    return "SEM_CONTRATO_ATIVO";
  }

  if (normalizedStatus === "AWAITING_PAYMENT") {
    return "AGUARDANDO_PAGAMENTO";
  }

  if (normalizedStatus === "AWAITING_ACCEPTANCE") {
    return "AGUARDANDO_ACEITE";
  }

  return "SEM_CONTRATO_ATIVO";
}

function getContractCommercialStatus(status: string, type: string): string {
  if (status === "ACTIVE" && type === "TRIAL") return "EXPERIENCIA_ATIVA";
  if (status === "ACTIVE") return "CONTRATO_ATIVO";
  if (status === "SUSPENDED") return "SUSPENSO_POR_PAGAMENTO";
  if (status === "AWAITING_PAYMENT") return "AGUARDANDO_PAGAMENTO";
  if (status === "AWAITING_ACCEPTANCE") return "AGUARDANDO_ACEITE";
  if (status === "FINALIZED") return "FINALIZADO";
  if (status === "CANCELLED") return "CANCELADO";

  return "RASCUNHO";
}

function contractNumber(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `CTR-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeContract(contract: any) {
  return {
    id: contract.id,
    studentId: contract.studentId,
    studentName: contract.student?.name || "Aluno",
    studentEmail: contract.student?.email || contract.student?.userAuth?.email || null,
    planId: contract.planId,
    planName: contract.plan?.name || "Plano avulso",
    professorId: contract.professorId,
    professorName: contract.professor?.name || contract.student?.user?.name || "Sem professor",
    contractNumber: contract.contractNumber,
    type: contract.type,
    status: contract.status,
    commercialStatus: contract.commercialStatus,
    startDate: contract.startDate,
    endDate: contract.endDate,
    durationMonths: contract.durationMonths,
    workoutsPerWeek: contract.workoutsPerWeek,
    workoutsPerMonth: contract.workoutsPerMonth,
    totalContractedWorkouts: contract.totalContractedWorkouts,
    priceCents: contract.priceCents,
    paymentMode: contract.paymentMode,
    source: contract.source,
    notes: contract.notes,
    acceptedAt: contract.acceptedAt,
    activatedAt: contract.activatedAt,
    finalizedAt: contract.finalizedAt,
    cancelledAt: contract.cancelledAt,
    suspendedAt: contract.suspendedAt,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

function normalizeStudent(student: any) {
  return {
    id: student.id,
    name: student.name,
    email: student.email || student.userAuth?.email || null,
    phone: student.phone,
    professorId: student.userId,
    professorName: student.user?.name || null,
    commercialStatus: student.commercialStatus || "SEM_CONTRATO_ATIVO",
    contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
    active: student.active,
  };
}

function normalizePlan(plan: any) {
  return {
    id: plan.id,
    name: plan.name,
    workoutsPerWeek: plan.workoutsPerWeek,
    workoutsPerMonth: plan.workoutsPerMonth,
    durationMonths: plan.durationMonths,
    priceCents: plan.priceCents,
    allowTrial: plan.allowTrial,
    trialDays: plan.trialDays,
    active: plan.active,
  };
}

async function refreshStudentCommercialStatus(studentId: string) {
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
    const commercialStatus = mapStudentCommercialStatus({
      status: activeContract.status,
      type: activeContract.type,
    });

    await prisma.student.update({
      where: {
        id: studentId,
      },
      data: {
        commercialStatus,
        contractedTrainingDaysPerMonth: activeContract.workoutsPerMonth,
        ...(activeContract.professorId ? { userId: activeContract.professorId } : {}),
      },
    });

    return commercialStatus;
  }

  const suspendedContract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: "SUSPENDED",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (suspendedContract) {
    await prisma.student.update({
      where: {
        id: studentId,
      },
      data: {
        commercialStatus: "SUSPENSO_POR_PAGAMENTO",
      },
    });

    return "SUSPENSO_POR_PAGAMENTO";
  }

  await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      commercialStatus: "SEM_CONTRATO_ATIVO",
      contractedTrainingDaysPerMonth: null,
    },
  });

  return "SEM_CONTRATO_ATIVO";
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
    const studentId = request.nextUrl.searchParams.get("studentId");
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const where: any = {};

    if (status && status !== "TODOS") {
      where.status = status;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (role === "TEACHER") {
      where.OR = [
        {
          professorId: userId,
        },
        {
          student: {
            userId,
          },
        },
      ];
    }

    const [contracts, students, plans] = await Promise.all([
      prisma.studentContract.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userId: true,
              commercialStatus: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  email: true,
                },
              },
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
        orderBy: [
          {
            endDate: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 300,
      }),

      prisma.student.findMany({
        where:
          role === "TEACHER"
            ? {
                userId,
                active: true,
              }
            : {
                active: true,
              },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          userId: true,
          commercialStatus: true,
          contractedTrainingDaysPerMonth: true,
          active: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userAuth: {
            select: {
              email: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),

      prisma.servicePlan.findMany({
        where: {
          active: true,
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      }),
    ]);

    const normalizedContracts = contracts.map(normalizeContract);
    const normalizedStudents = students.map(normalizeStudent);
    const normalizedPlans = plans.map(normalizePlan);

    const activeContracts = normalizedContracts.filter((contract) => contract.status === "ACTIVE");
    const endingSoonContracts = normalizedContracts.filter((contract) => {
      const endDate = new Date(contract.endDate);
      return contract.status === "ACTIVE" && endDate >= now && endDate <= in7Days;
    });
    const expiredContracts = normalizedContracts.filter((contract) => {
      const endDate = new Date(contract.endDate);
      return contract.status === "ACTIVE" && endDate < now;
    });
    const trialContracts = normalizedContracts.filter((contract) => contract.type === "TRIAL" && contract.status === "ACTIVE");
    const noContractStudents = normalizedStudents.filter((student) => {
      return !activeContracts.some((contract) => contract.studentId === student.id);
    });

    const expectedRevenueCents = normalizedContracts
      .filter((contract) => contract.status === "ACTIVE" || contract.status === "AWAITING_PAYMENT")
      .reduce((sum, contract) => sum + Number(contract.priceCents || 0), 0);

    return NextResponse.json({
      contracts: normalizedContracts,
      students: normalizedStudents,
      plans: normalizedPlans,
      noContractStudents,
      metrics: {
        totalContracts: normalizedContracts.length,
        activeContracts: activeContracts.length,
        endingSoonContracts: endingSoonContracts.length,
        expiredContracts: expiredContracts.length,
        trialContracts: trialContracts.length,
        noContractStudents: noContractStudents.length,
        expectedRevenueCents,
      },
    });
  } catch (error: any) {
    console.error("GET /api/student-contracts error:", error);

    const message = String(error?.message || "");
    const code = String(error?.code || "");

    if (
      code === "P2021" ||
      code === "P2022" ||
      message.includes("student_contracts") ||
      message.includes("service_plans") ||
      message.includes("commercial_status") ||
      message.includes("contract_id")
    ) {
      return NextResponse.json(
        {
          error:
            "A estrutura de contratos ainda não está completa no banco de produção. Rode o SQL da Fase 1 no mesmo Neon usado pela Vercel.",
          message,
          code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Erro ao buscar contratos.",
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

    const studentId = String(body?.studentId || "").trim();
    const planId = String(body?.planId || "").trim() || null;
    const professorId = String(body?.professorId || "").trim() || null;
    const type = String(body?.type || "PAID").toUpperCase();
    const status = String(body?.status || (body?.activate ? "ACTIVE" : "DRAFT")).toUpperCase();
    const startDate = parseDate(body?.startDate);
    const source = String(body?.source || "MANUAL").toUpperCase();
    const notes = String(body?.notes || "").trim() || null;

    if (!studentId) {
      return NextResponse.json({ error: "Aluno é obrigatório." }, { status: 400 });
    }

    const [student, plan] = await Promise.all([
      prisma.student.findUnique({
        where: {
          id: studentId,
        },
        select: {
          id: true,
          name: true,
          userId: true,
        },
      }),
      planId
        ? prisma.servicePlan.findUnique({
            where: {
              id: planId,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    if (planId && !plan) {
      return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    }

    const durationMonths = toInt(body?.durationMonths, plan?.durationMonths || 1);
    const workoutsPerWeek = toInt(body?.workoutsPerWeek, plan?.workoutsPerWeek || 2);
    const workoutsPerMonth = toInt(body?.workoutsPerMonth, plan?.workoutsPerMonth || workoutsPerWeek * 4);
    const totalContractedWorkouts = workoutsPerMonth * Math.max(durationMonths, 1);
    const priceCents = toInt(body?.priceCents, plan?.priceCents || 0);
    const paymentMode = String(body?.paymentMode || "UNICO").toUpperCase();
    const endDate = addMonthsMinusOneDay(startDate, durationMonths);
    const commercialStatus = getContractCommercialStatus(status, type);

    if (durationMonths <= 0) {
      return NextResponse.json({ error: "Duração do contrato precisa ser maior que zero." }, { status: 400 });
    }

    if (workoutsPerMonth <= 0 || workoutsPerWeek <= 0) {
      return NextResponse.json({ error: "Quantidade de treinos precisa ser maior que zero." }, { status: 400 });
    }

    const contract = await prisma.$transaction(async (tx) => {
      if (status === "ACTIVE") {
        await tx.studentContract.updateMany({
          where: {
            studentId,
            status: "ACTIVE",
          },
          data: {
            status: "FINALIZED",
            commercialStatus: "FINALIZADO",
            finalizedAt: new Date(),
          },
        });
      }

      const created = await tx.studentContract.create({
        data: {
          studentId,
          planId,
          professorId: professorId || student.userId || null,
          contractNumber: contractNumber(),
          type,
          status,
          commercialStatus,
          startDate,
          endDate,
          durationMonths,
          workoutsPerWeek,
          workoutsPerMonth,
          totalContractedWorkouts,
          priceCents,
          paymentMode,
          source,
          notes,
          createdById: userId,
          activatedAt: status === "ACTIVE" ? new Date() : null,
          acceptedAt: status === "ACTIVE" ? new Date() : null,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userId: true,
              commercialStatus: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  email: true,
                },
              },
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

      if (status === "ACTIVE") {
        await tx.student.update({
          where: {
            id: studentId,
          },
          data: {
            commercialStatus: mapStudentCommercialStatus({ status, type }),
            contractedTrainingDaysPerMonth: workoutsPerMonth,
            ...(professorId ? { userId: professorId } : {}),
          },
        });
      }

      return created;
    });

    return NextResponse.json({
      ok: true,
      contract: normalizeContract(contract),
    });
  } catch (error: any) {
    console.error("POST /api/student-contracts error:", error);

    return NextResponse.json(
      {
        error: "Erro ao criar contrato.",
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
    const nextStatus = String(body?.status || "").toUpperCase();

    if (!id) {
      return NextResponse.json({ error: "ID do contrato é obrigatório." }, { status: 400 });
    }

    if (!["DRAFT", "AWAITING_ACCEPTANCE", "AWAITING_PAYMENT", "ACTIVE", "FINALIZED", "CANCELLED", "SUSPENDED"].includes(nextStatus)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const existing = await prisma.studentContract.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
    }

    const commercialStatus = getContractCommercialStatus(nextStatus, existing.type);
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      if (nextStatus === "ACTIVE") {
        await tx.studentContract.updateMany({
          where: {
            studentId: existing.studentId,
            status: "ACTIVE",
            id: {
              not: id,
            },
          },
          data: {
            status: "FINALIZED",
            commercialStatus: "FINALIZADO",
            finalizedAt: now,
          },
        });
      }

      const data: any = {
        status: nextStatus,
        commercialStatus,
      };

      if (nextStatus === "ACTIVE") {
        data.activatedAt = existing.activatedAt || now;
        data.acceptedAt = existing.acceptedAt || now;
        data.finalizedAt = null;
        data.cancelledAt = null;
        data.suspendedAt = null;
      }

      if (nextStatus === "FINALIZED") {
        data.finalizedAt = now;
      }

      if (nextStatus === "CANCELLED") {
        data.cancelledAt = now;
      }

      if (nextStatus === "SUSPENDED") {
        data.suspendedAt = now;
      }

      const contract = await tx.studentContract.update({
        where: {
          id,
        },
        data,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              userId: true,
              commercialStatus: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAuth: {
                select: {
                  email: true,
                },
              },
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

      if (nextStatus === "ACTIVE") {
        await tx.student.update({
          where: {
            id: existing.studentId,
          },
          data: {
            commercialStatus: mapStudentCommercialStatus({
              status: nextStatus,
              type: existing.type,
            }),
            contractedTrainingDaysPerMonth: existing.workoutsPerMonth,
            ...(existing.professorId ? { userId: existing.professorId } : {}),
          },
        });
      }

      if (nextStatus === "SUSPENDED") {
        await tx.student.update({
          where: {
            id: existing.studentId,
          },
          data: {
            commercialStatus: "SUSPENSO_POR_PAGAMENTO",
          },
        });
      }

      return contract;
    });

    if (["FINALIZED", "CANCELLED"].includes(nextStatus)) {
      await refreshStudentCommercialStatus(existing.studentId);
    }

    return NextResponse.json({
      ok: true,
      contract: normalizeContract(updated),
    });
  } catch (error: any) {
    console.error("PUT /api/student-contracts error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar contrato.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
