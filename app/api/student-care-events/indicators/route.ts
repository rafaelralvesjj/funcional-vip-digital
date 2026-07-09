import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const dynamic = "force-dynamic";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addDaysToDate(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function calculatePauseDays(start?: Date | string | null, end?: Date | string | null): number {
  const startDate = startOfDay(start ? new Date(start) : new Date());
  const endDate = startOfDay(end ? new Date(end) : new Date());
  const diff = endDate.getTime() - startDate.getTime();

  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function getContractTypeLabel(type?: string | null): string {
  if (type === "TRIAL") return "Experiência gratuita";
  if (type === "PAID") return "Plano pago";

  return type || "Sem contrato vinculado";
}

function incrementCounter(map: Record<string, number>, key?: string | null) {
  const normalizedKey = String(key || "NÃO_INFORMADO").toUpperCase();
  map[normalizedKey] = (map[normalizedKey] || 0) + 1;
}

function buildRoleWhere(role: string, userId: string) {
  if (role === "GESTOR" || role === "ADMIN") return {};

  if (role === "TEACHER") {
    return {
      OR: [
        {
          professorId: userId,
        },
        {
          student: {
            userId,
          },
        },
      ],
    };
  }

  return null;
}

function buildCommercialImpact(event: any) {
  if (event.eventType !== "PAUSA_POR_CUIDADO") {
    return {
      applies: false,
      status: "SEM_IMPACTO_ESPECIFICO",
      label: "Sem impacto comercial específico",
      managementAction: "Acompanhar pelo fluxo comum de cuidado/adesão.",
    };
  }

  const isResolved = event.status === "RESOLVIDO" || Boolean(event.resolvedAt);
  const contract = event.contract || null;
  const pauseDays = calculatePauseDays(event.createdAt, event.resolvedAt || new Date());

  const base = {
    applies: true,
    pauseDays,
    startedAt: toIso(event.createdAt),
    resolvedAt: toIso(event.resolvedAt),
    contractId: contract?.id || null,
    contractType: contract?.type || null,
    contractTypeLabel: getContractTypeLabel(contract?.type),
    contractStatus: contract?.status || null,
    contractCommercialStatus: contract?.commercialStatus || null,
    contractStartDate: toIso(contract?.startDate),
    contractEndDate: toIso(contract?.endDate),
    contractPriceCents: typeof contract?.priceCents === "number" ? contract.priceCents : null,
    workoutsPerWeek: typeof contract?.workoutsPerWeek === "number" ? contract.workoutsPerWeek : null,
    workoutsPerMonth: typeof contract?.workoutsPerMonth === "number" ? contract.workoutsPerMonth : null,
    planName: contract?.plan?.name || null,
    countsAsCompletedWorkout: false,
    countsAsAbsence: false,
    countsAsLowAdherence: false,
  };

  if (!contract) {
    return {
      ...base,
      status: "SEM_CONTRATO_VINCULADO",
      label: "Sem contrato vinculado",
      managementAction: "Gestão deve avaliar manualmente se há impacto comercial associado ao período pausado.",
    };
  }

  if (contract.type === "TRIAL") {
    return {
      ...base,
      status: isResolved ? "EXPERIENCIA_PRORROGADA" : "EXPERIENCIA_A_PRESERVAR",
      label: isResolved ? "Experiência prorrogada" : "Experiência a preservar",
      managementAction: isResolved
        ? "Conferir se a data de fim da experiência ficou coerente após a liberação da retomada."
        : "Aguardar retomada segura; ao professor resolver, o sistema preserva/prorroga os dias pausados.",
    };
  }

  return {
    ...base,
    status: isResolved ? "COMPENSACAO_COMERCIAL_REGISTRADA" : "COMPENSACAO_COMERCIAL_PENDENTE",
    label: isResolved ? "Avaliação comercial registrada" : "Avaliação comercial pendente",
    managementAction: isResolved
      ? "Gestão decide se haverá compensação, crédito ou prorrogação conforme política comercial."
      : "Gestão acompanha impacto potencial; não dar desconto automático e não contar como falta/baixa adesão comum.",
  };
}

function normalizePauseEvent(event: any) {
  const commercialImpact = buildCommercialImpact(event);

  return {
    id: event.id,
    studentId: event.studentId,
    studentName: event.student?.name || "Aluno",
    studentEmail: event.student?.email || event.student?.userAuth?.email || null,
    professorId: event.professorId || event.student?.userId || null,
    professorName: event.professor?.name || event.student?.user?.name || "Sem professor",
    eventType: event.eventType,
    severity: event.severity,
    status: event.status,
    statusLabel:
      event.eventType === "PAUSA_POR_CUIDADO" && event.status === "EM_REVISAO"
        ? "Retomada solicitada"
        : event.eventType === "PAUSA_POR_CUIDADO" && event.status === "REQUER_REVISAO"
          ? "Aguardando aptidão"
          : event.status,
    title: event.title,
    description: event.description,
    professorMessage: event.professorMessage,
    createdAt: toIso(event.createdAt),
    resolvedAt: toIso(event.resolvedAt),
    updatedAt: toIso(event.updatedAt),
    pauseDays: commercialImpact.pauseDays || 0,
    commercialImpact,
  };
}

function normalizeLifecycleEvent(event: any) {
  return {
    id: event.id,
    eventType: event.eventType,
    eventKey: event.eventKey,
    channel: event.channel,
    createdAt: toIso(event.createdAt),
    studentId: event.studentId,
    studentName: event.student?.name || "Aluno",
    contractId: event.contractId,
    contractType: event.contract?.type || null,
    contractTypeLabel: getContractTypeLabel(event.contract?.type),
    contractEndDate: toIso(event.contract?.endDate),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const roleWhere = buildRoleWhere(role, userId);

    if (!roleWhere) {
      return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 });
    }

    const rawDays = Number(request.nextUrl.searchParams.get("days") || 30);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.round(rawDays), 365) : 30;
    const periodStart = startOfDay(addDaysToDate(new Date(), -days));

    const periodWhere = {
      OR: [
        {
          status: {
            not: "RESOLVIDO",
          },
        },
        {
          createdAt: {
            gte: periodStart,
          },
        },
        {
          resolvedAt: {
            gte: periodStart,
          },
        },
      ],
    };

    const eventWhere: any = {
      AND: [roleWhere, periodWhere],
    };

    const pauseWhere: any = {
      AND: [roleWhere, periodWhere, { eventType: "PAUSA_POR_CUIDADO" }],
    };

    const [events, pauseEvents, lifecycleEvents] = await Promise.all([
      prisma.studentCareEvent.findMany({
        where: eventWhere,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              userId: true,
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
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          contract: {
            select: {
              id: true,
              type: true,
              status: true,
              commercialStatus: true,
              startDate: true,
              endDate: true,
              priceCents: true,
              workoutsPerWeek: true,
              workoutsPerMonth: true,
              plan: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 300,
      }),
      prisma.studentCareEvent.findMany({
        where: pauseWhere,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              userId: true,
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
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          contract: {
            select: {
              id: true,
              type: true,
              status: true,
              commercialStatus: true,
              startDate: true,
              endDate: true,
              priceCents: true,
              workoutsPerWeek: true,
              workoutsPerMonth: true,
              plan: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 300,
      }),
      prisma.contractLifecycleEvent.findMany({
        where: {
          ...(role === "TEACHER"
            ? {
                student: {
                  userId,
                },
              }
            : {}),
          eventType: {
            in: ["TRIAL_EXTENDED_BY_CARE_PAUSE", "PAID_CARE_PAUSE_COMPENSATION_REVIEW"],
          },
          createdAt: {
            gte: periodStart,
          },
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
          contract: {
            select: {
              id: true,
              type: true,
              endDate: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 80,
      }),
    ]);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byContractType: Record<string, number> = {};
    const byProfessor: Record<string, number> = {};

    for (const event of events) {
      incrementCounter(byStatus, event.status);
      incrementCounter(byType, event.eventType);
      incrementCounter(byProfessor, event.professor?.name || event.student?.user?.name || "Sem professor");
    }

    const normalizedPauses = pauseEvents.map(normalizePauseEvent);
    const openPauses = normalizedPauses.filter((event) => event.status !== "RESOLVIDO");
    const resolvedPauses = normalizedPauses.filter((event) => event.status === "RESOLVIDO");

    for (const event of normalizedPauses) {
      incrementCounter(byContractType, event.commercialImpact?.contractTypeLabel || "Sem contrato");
    }

    const uniquePausedStudents = new Set(openPauses.map((event) => event.studentId));
    const openPauseDays = openPauses.reduce((sum, event) => sum + (event.pauseDays || 0), 0);
    const avgOpenPauseDays = openPauses.length ? Math.round((openPauseDays / openPauses.length) * 10) / 10 : 0;

    const trialToPreserve = openPauses.filter((event) => event.commercialImpact?.contractType === "TRIAL").length;
    const paidCompensationPending = openPauses.filter((event) => event.commercialImpact?.contractType === "PAID").length;
    const withoutContract = openPauses.filter((event) => !event.commercialImpact?.contractId).length;
    const returnRequested = openPauses.filter((event) => event.status === "EM_REVISAO").length;
    const waitingAptitude = openPauses.filter((event) => event.status === "REQUER_REVISAO").length;

    const trialExtendedInPeriod = lifecycleEvents.filter((event) => event.eventType === "TRIAL_EXTENDED_BY_CARE_PAUSE").length;
    const paidReviewsRegisteredInPeriod = lifecycleEvents.filter((event) => event.eventType === "PAID_CARE_PAUSE_COMPENSATION_REVIEW").length;

    const criticalActiveEvents = events.filter((event) => event.severity === "CUIDADO" && event.status !== "RESOLVIDO").length;
    const reviewActiveEvents = events.filter((event) => ["REQUER_REVISAO", "EM_REVISAO"].includes(event.status)).length;

    return NextResponse.json({
      ok: true,
      period: {
        days,
        startAt: periodStart.toISOString(),
        generatedAt: new Date().toISOString(),
      },
      permissions: {
        role,
        canSeeAll: role === "GESTOR" || role === "ADMIN",
        label:
          role === "TEACHER"
            ? "Professor: indicadores dos seus alunos."
            : "Gestão: indicadores consolidados de todos os alunos.",
      },
      cards: {
        totalEvents: events.length,
        criticalActiveEvents,
        reviewActiveEvents,
        openPauseEvents: openPauses.length,
        openPausedStudents: uniquePausedStudents.size,
        returnRequested,
        waitingAptitude,
        trialToPreserve,
        paidCompensationPending,
        withoutContract,
        totalOpenPauseDays: openPauseDays,
        avgOpenPauseDays,
        resolvedPausesInPeriod: resolvedPauses.length,
        trialExtendedInPeriod,
        paidReviewsRegisteredInPeriod,
      },
      breakdown: {
        byStatus,
        byType,
        byContractType,
        byProfessor,
      },
      openPauses,
      resolvedPauses,
      lifecycleEvents: lifecycleEvents.map(normalizeLifecycleEvent),
      managementGuidance: [
        "Pausas por cuidado abertas bloqueiam treino normal até o professor resolver/liberar retomada.",
        "Experiência gratuita deve preservar dias pausados quando houver retomada segura.",
        "Plano pago não recebe desconto automático; a gestão avalia compensação, crédito ou prorrogação conforme política comercial.",
        "Pausa por cuidado não conta como treino feito, falta ou baixa adesão comum.",
      ],
    });
  } catch (error: any) {
    console.error("GET /api/student-care-events/indicators error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao carregar indicadores de cuidado.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
