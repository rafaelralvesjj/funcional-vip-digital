import { prisma } from "@/lib/prisma";
import { getStudentDisplayName } from "@/lib/display-name";
import { shouldShowContractCta, trialWindowFromContractDates } from "@/lib/trial-window";
import { pickMoneyRelevantPayment } from "@/lib/contract-payment-priority";
import { normalizeWorkoutMethodMode, isEligibleForCombinedWorkoutInvite, type WorkoutMethodMode } from "@/lib/workout-method-mode";

// Status que contam como "treino realmente concluído" para a janela de 30
// dias do convite ao combinado (ver lib/workout-method-mode.ts) — os mesmos
// usados em todo o resto do app para "o aluno fez esse treino".
const COMPLETED_WORKOUT_STATUSES = ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"];

export type StudentDashboardUiState =
  | "EXPERIENCIA_ATIVA"
  | "CONTRATO_ATIVO"
  | "PAUSA_POR_CUIDADO"
  | "EXPERIENCIA_AGENDADA"
  | "AGUARDANDO_PAGAMENTO"
  | "AGUARDANDO_VINCULO_PROFESSOR"
  | "SUSPENSO_POR_PAGAMENTO"
  | "SEM_CONTRATO_ATIVO";

type DashboardInput =
  | {
      userId?: string | null;
      email?: string | null;
    }
  | string
  | null
  | undefined;

export type StudentDashboardSummary = {
  student: {
    id: string;
    name: string;
    preferredName: string | null;
    displayName: string;
    email: string | null;
    phone: string | null;
    image: string | null;
    commercialStatus: string;
    workoutMethodMode: WorkoutMethodMode;
  };
  currentCycle: {
    id: string;
    type: string;
    status: string;
    commercialStatus: string;
    startDate: string;
    endDate: string;
    daysLeft: number;
    daysUntilStart?: number | null;
    workoutsPerWeek: number;
    workoutsPerMonth: number;
    totalContractedWorkouts: number;
    priceCents: number;
    planName: string | null;
  } | null;
  professor: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  payment: {
    id: string;
    status: string;
    dueDate: string;
    paidAt: string | null;
    amountCents: number;
    method: string | null;
    paymentLinkUrl: string | null;
  } | null;
  currentCarePause: {
    id: string;
    eventType: string;
    severity: string;
    status: string;
    title: string;
    description: string | null;
    studentMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  commercialImpact: {
    status: "SEM_IMPACTO" | "CONGELAR_EXPERIENCIA" | "AVALIAR_COMPENSACAO";
    affectsTrainingDelivery: boolean;
    countsAsCompletedWorkout: boolean;
    countsAsAbsence: boolean;
    recommendedAction: string | null;
    preservedTrialDays: number | null;
    message: string | null;
  };
  flags: {
    isTrial: boolean;
    isPaid: boolean;
    isAwaitingPayment: boolean;
    isWithoutActiveContract: boolean;
    isTrainingBlocked: boolean;
    hasProfessor: boolean;
    hasPaymentIssue: boolean;
    hasOpenCarePause: boolean;
    hasCarePauseAwaitingReturn: boolean;
    hasCarePauseUnderReview: boolean;
    isTrialScheduledToStart: boolean;
    daysUntilTrialStart: number | null;
    shouldEvaluateCommercialCompensation: boolean;
    showContractCta: boolean;
    showCombinedWorkoutCta: boolean;
  };
  uiState: StudentDashboardUiState;
  hasActiveAccess: boolean;
  shouldBlockTraining: boolean;
  title: string;
  message: string;
  actionLabel: string | null;
};

function toDateOnlyISOString(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString();
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getDaysLeft(endDate: Date) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(endDate));
  const diff = end.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDaysUntilStart(startDate: Date | string | null | undefined): number | null {
  if (!startDate) return null;

  const today = startOfDay(new Date());
  const start = startOfDay(new Date(startDate));

  if (Number.isNaN(start.getTime())) return null;

  const diff = start.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDaysLeftAtPauseStart(endDate: Date, pauseCreatedAt?: Date | string | null): number | null {
  if (!pauseCreatedAt) return null;

  const pauseStart = startOfDay(new Date(pauseCreatedAt));
  const end = startOfDay(new Date(endDate));

  if (Number.isNaN(pauseStart.getTime()) || Number.isNaN(end.getTime())) return null;

  const diff = end.getTime() - pauseStart.getTime();

  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

/**
 * Um contrato só conta como "em vigor agora" se seu startDate já chegou.
 * Sem essa checagem, um contrato pago criado com status ACTIVE mas startDate
 * no futuro (ex.: pagamento antecipado que preserva os 7 dias de teste —
 * ver resolvePaidContractStart em lib/trial-window.ts) seria tratado como o
 * contrato atual antes da hora, escondendo o teste que ainda é válido.
 *
 * REVISÃO: startDate/endDate são instantes reais (um contrato pago pode
 * começar literalmente à meia-noite de um dia civil de São Paulo, ou no
 * instante exato da confirmação do pagamento) — nunca truncar para
 * "início do dia" no fuso do host (startOfDay/setHours), que reintroduziria
 * um fuso horário implícito (UTC na Vercel) nessa decisão. Comparação
 * direta de instante, sempre.
 */
export function hasContractStarted(
  contract: { startDate: Date | string },
  referenceDate: Date = new Date()
): boolean {
  return new Date(contract.startDate).getTime() <= referenceDate.getTime();
}

/**
 * TRIAL em curso de verdade: ACTIVE, já começou e ainda não expirou. Usado
 * para dar prioridade ao teste sobre um PAID AGUARDANDO_PAGAMENTO que o
 * gestor tenha criado em paralelo (ver pickCurrentContract) — só depois que
 * o teste termina de verdade é que o PAID pendente pode virar o contrato
 * "atual" exibido ao aluno.
 */
function isTrialActiveAndValid(contract: any, referenceDate: Date): boolean {
  if (contract.type !== "TRIAL" || contract.status !== "ACTIVE") return false;
  if (!hasContractStarted(contract, referenceDate)) return false;

  return new Date(contract.endDate).getTime() >= referenceDate.getTime();
}

export function pickCurrentContract(
  contracts: any[],
  activeCarePause?: any | null,
  referenceDate: Date = new Date()
) {
  if (!contracts?.length) return null;

  const validActiveTrial = contracts.find((contract) => isTrialActiveAndValid(contract, referenceDate));

  const activeOrAwaiting = contracts.find((contract) => {
    const isNotExpired = new Date(contract.endDate).getTime() >= referenceDate.getTime();

    // Enquanto existir um TRIAL ACTIVE e válido, um PAID AGUARDANDO_PAGAMENTO
    // não pode assumir como contrato atual — o teste em curso prevalece.
    if (
      contract.status === "AWAITING_PAYMENT" &&
      validActiveTrial &&
      validActiveTrial.id !== contract.id
    ) {
      return false;
    }

    return (
      hasContractStarted(contract, referenceDate) &&
      isNotExpired &&
      ["ACTIVE", "AWAITING_PAYMENT", "SUSPENDED"].includes(contract.status)
    );
  });

  if (activeOrAwaiting) return activeOrAwaiting;

  if (validActiveTrial) return validActiveTrial;

  const trialStillValid = contracts.find((contract) => {
    return contract.type === "TRIAL" && new Date(contract.endDate).getTime() >= referenceDate.getTime();
  });

  if (trialStillValid) return trialStillValid;

  if (activeCarePause) {
    const pauseCreatedAt = new Date(activeCarePause.createdAt);

    const frozenTrial = contracts.find((contract) => {
      const inactiveContractStatus = ["FINALIZED", "CANCELLED"].includes(contract.status);

      return (
        contract.type === "TRIAL" &&
        !inactiveContractStatus &&
        !Number.isNaN(pauseCreatedAt.getTime()) &&
        pauseCreatedAt.getTime() <= new Date(contract.endDate).getTime()
      );
    });

    if (frozenTrial) return frozenTrial;
  }

  return contracts[0] || null;
}

/**
 * Existe um PAID em vigor (ACTIVE já iniciado ou ainda por iniciar) ou
 * aguardando pagamento, ainda não expirado — qualquer um desses esconde o
 * CTA "Contratar plano" (ver computeShowContractCta).
 */
function hasPaidContractActiveOrScheduled(contracts: any[], today: Date): boolean {
  return (contracts || []).some((contract) => {
    if (contract.type !== "PAID") return false;
    if (!["ACTIVE", "AWAITING_PAYMENT"].includes(contract.status)) return false;

    const endDate = startOfDay(new Date(contract.endDate));
    return endDate.getTime() >= today.getTime();
  });
}

/**
 * CTA "Contratar plano": só faz sentido existir um TRIAL (é dele que vem a
 * contagem T-2 dias). Reaproveita shouldShowContractCta (lib/trial-window.ts)
 * contra as datas reais do TRIAL do aluno, não uma janela recém-calculada.
 */
export function computeShowContractCta(contracts: any[], today: Date = new Date()): boolean {
  const trial = (contracts || []).find((contract) => contract.type === "TRIAL");
  if (!trial) return false;

  return shouldShowContractCta({
    window: trialWindowFromContractDates({
      startDate: new Date(trial.startDate),
      endDate: new Date(trial.endDate),
    }),
    now: today,
    hasPaidContractActiveOrScheduled: hasPaidContractActiveOrScheduled(contracts, today),
  });
}

/**
 * CTA "Experimente um treino combinado": só aparece para quem ainda está em
 * NORMAL (quem já está em COMBINADO vê a opção de voltar, não este convite)
 * e só depois de 30 dias desde o primeiro treino REALMENTE concluído —
 * nunca a partir de cadastro, contrato, WorkoutPlan criado ou semana
 * liberada. Pura: toda a regra de elegibilidade vive em
 * lib/workout-method-mode.ts; esta função só decide se o convite faz
 * sentido mostrar (modo ainda NORMAL) em cima dela.
 */
export function computeShowCombinedWorkoutCta(params: {
  workoutMethodMode: WorkoutMethodMode;
  firstCompletedWorkoutDate: Date | null;
  now?: Date;
}): boolean {
  if (params.workoutMethodMode !== "NORMAL") return false;

  return isEligibleForCombinedWorkoutInvite({
    firstCompletedWorkoutDate: params.firstCompletedWorkoutDate,
    now: params.now,
  });
}

function buildUiState(params: {
  contract: any | null;
  payment: any | null;
  professor: any | null;
  activeCarePause?: any | null;
}): StudentDashboardUiState {
  const { contract, payment, professor, activeCarePause } = params;

  if (!contract) return "SEM_CONTRATO_ATIVO";

  const daysLeft = getDaysLeft(contract.endDate);
  const isExpired = daysLeft < 0;
  const inactiveContractStatus = ["FINALIZED", "CANCELLED"].includes(contract.status);

  if (isExpired || inactiveContractStatus) {
    if (!(contract.type === "TRIAL" && activeCarePause)) {
      return "SEM_CONTRATO_ATIVO";
    }
  }

  const daysUntilStart = getDaysUntilStart(contract.startDate);

  if (contract.type === "TRIAL" && daysUntilStart !== null && daysUntilStart > 0) {
    return "EXPERIENCIA_AGENDADA";
  }

  if (activeCarePause) return "PAUSA_POR_CUIDADO";

  if (contract.status === "SUSPENDED") return "SUSPENSO_POR_PAGAMENTO";

  if (payment?.status === "ATRASADO") return "SUSPENSO_POR_PAGAMENTO";

  if (contract.status === "AWAITING_PAYMENT") return "AGUARDANDO_PAGAMENTO";

  if (["EM_ABERTO", "PARCIAL"].includes(payment?.status)) return "AGUARDANDO_PAGAMENTO";

  if (!professor) return "AGUARDANDO_VINCULO_PROFESSOR";

  if (contract.type === "TRIAL") return "EXPERIENCIA_ATIVA";

  return "CONTRATO_ATIVO";
}

function buildText(uiState: StudentDashboardUiState, daysLeft?: number) {
  const safeDaysLeft = typeof daysLeft === "number" ? Math.max(daysLeft, 0) : null;

  const endingText =
    safeDaysLeft === null
      ? ""
      : safeDaysLeft === 0
        ? " O ciclo vence hoje."
        : ` Faltam ${safeDaysLeft} dia${safeDaysLeft === 1 ? "" : "s"} para o vencimento.`;

  const texts: Record<
    StudentDashboardUiState,
    { title: string; message: string; actionLabel: string | null }
  > = {
    EXPERIENCIA_ATIVA: {
      title: "Experiência gratuita ativa",
      message: `Sua experiência gratuita está ativa.${endingText} Aproveite esse período para conhecer seu treino e acompanhar as orientações do professor.`,
      actionLabel: "Ver meu treino",
    },
    CONTRATO_ATIVO: {
      title: "Plano ativo",
      message: `Seu contrato está ativo.${endingText} Você já pode seguir seu ciclo de treinos normalmente.`,
      actionLabel: "Continuar treinando",
    },
    PAUSA_POR_CUIDADO: {
      title: "Treinos pausados por cuidado",
      message:
        "Existe uma pausa por cuidado aberta. Seus treinos ficam pausados até você sinalizar aptidão de retomada e o professor revisar/liberar com segurança. Esse período não deve ser tratado como falta ou baixa adesão comum.",
      actionLabel: "Sinalizar retomada quando estiver apto(a)",
    },
    EXPERIENCIA_AGENDADA: {
      title: "Experiência agendada",
      message:
        "Seu cadastro foi ativado, mas sua primeira janela segura de treino começa na próxima semana. Isso evita começar atrasado ou receber treino corrido no fim da semana. A experiência passa a contar a partir da primeira semana real de acompanhamento.",
      actionLabel: "Aguardar início seguro",
    },
    AGUARDANDO_PAGAMENTO: {
      title: "Pagamento pendente",
      message:
        "Seu plano foi registrado, mas ainda existe pagamento pendente. Assim que o pagamento for confirmado, o acesso fica regularizado.",
      actionLabel: "Ver situação do pagamento",
    },
    AGUARDANDO_VINCULO_PROFESSOR: {
      title: "Aguardando vínculo com professor",
      message:
        "Seu cadastro está ativo, mas ainda falta o vínculo com um professor. A equipe está organizando isso para liberar o acompanhamento corretamente.",
      actionLabel: "Aguardar liberação",
    },
    SUSPENSO_POR_PAGAMENTO: {
      title: "Acesso suspenso por pagamento",
      message:
        "Existe uma pendência de pagamento no seu ciclo. Para voltar a acessar os treinos normalmente, regularize a situação com a equipe.",
      actionLabel: "Regularizar pagamento",
    },
    SEM_CONTRATO_ATIVO: {
      title: "Você está sem contrato ativo",
      message:
        "No momento, não encontramos uma experiência ou contrato ativo para o seu cadastro. Para continuar treinando, fale com a equipe e escolha o próximo plano.",
      actionLabel: "Falar com a equipe",
    },
  };

  return texts[uiState];
}

export async function getStudentDashboardSummary(
  input?: DashboardInput,
  fallbackEmail?: string | null,
): Promise<StudentDashboardSummary | null> {
  const userId = typeof input === "string" ? input : input?.userId || null;
  const email = normalizeEmail(typeof input === "string" ? fallbackEmail : input?.email || fallbackEmail);

  const orWhere: any[] = [];

  if (userId) {
    orWhere.push({ userAuthId: userId });
    orWhere.push({ userId });
  }

  if (email) {
    orWhere.push({ email: { equals: email, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: email, mode: "insensitive" } } });
  }

  if (!orWhere.length) return null;

  const student = await prisma.student.findFirst({
    where: {
      active: true,
      OR: orWhere,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
        },
      },
      userAuth: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      contracts: {
        orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
        include: {
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
          payments: {
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          },
        },
      },
      careEvents: {
        where: {
          eventType: "PAUSA_POR_CUIDADO",
          status: {
            not: "RESOLVIDO",
          },
          resolvedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          eventType: true,
          severity: true,
          status: true,
          title: true,
          description: true,
          studentMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      // Só para a janela de 30 dias do convite ao treino combinado (ver
      // lib/workout-method-mode.ts) — o primeiro treino REALMENTE
      // concluído, nunca cadastro/contrato/WorkoutPlan criado/semana
      // liberada.
      workouts: {
        where: {
          status: { in: COMPLETED_WORKOUT_STATUSES },
        },
        orderBy: { date: "asc" },
        take: 1,
        select: { date: true },
      },
    },
  });

  if (!student) return null;

  const activeCarePause = student.careEvents?.[0] || null;
  const contract = pickCurrentContract(student.contracts, activeCarePause);
  const payment = pickMoneyRelevantPayment(contract?.payments || []);
  const workoutMethodMode = normalizeWorkoutMethodMode(student.workoutMethodMode);
  const firstCompletedWorkoutDate = student.workouts?.[0]?.date
    ? new Date(student.workouts[0].date)
    : null;

  const fallbackProfessor = ["PROFESSOR", "TEACHER"].includes(student.user?.role)
    ? student.user
    : null;

  const professor = contract?.professor || fallbackProfessor || null;
  const uiState = buildUiState({ contract, payment, professor, activeCarePause });
  const preservedTrialDays = contract?.type === "TRIAL" && activeCarePause
    ? getDaysLeftAtPauseStart(contract.endDate, activeCarePause.createdAt)
    : null;
  const daysLeft = contract
    ? activeCarePause && contract.type === "TRIAL" && preservedTrialDays !== null
      ? preservedTrialDays
      : getDaysLeft(contract.endDate)
    : undefined;
  const text = buildText(uiState, daysLeft);

  const shouldBlockTraining = [
    "SEM_CONTRATO_ATIVO",
    "SUSPENSO_POR_PAGAMENTO",
    "PAUSA_POR_CUIDADO",
    "EXPERIENCIA_AGENDADA",
    "AGUARDANDO_PAGAMENTO",
    "AGUARDANDO_VINCULO_PROFESSOR",
  ].includes(uiState);

  const daysUntilTrialStart = contract?.type === "TRIAL" ? getDaysUntilStart(contract.startDate) : null;

  const flags = {
    isTrial: contract?.type === "TRIAL",
    isPaid: contract?.type === "PAID",
    isAwaitingPayment: uiState === "AGUARDANDO_PAGAMENTO",
    isWithoutActiveContract: uiState === "SEM_CONTRATO_ATIVO",
    isTrainingBlocked: shouldBlockTraining,
    hasProfessor: Boolean(professor),
    hasPaymentIssue: ["ATRASADO", "EM_ABERTO", "PARCIAL"].includes(payment?.status || ""),
    hasOpenCarePause: Boolean(activeCarePause),
    hasCarePauseAwaitingReturn: Boolean(activeCarePause && activeCarePause.status === "REQUER_REVISAO"),
    hasCarePauseUnderReview: Boolean(activeCarePause && activeCarePause.status === "EM_REVISAO"),
    isTrialScheduledToStart: uiState === "EXPERIENCIA_AGENDADA",
    daysUntilTrialStart,
    shouldEvaluateCommercialCompensation: Boolean(activeCarePause),
    showContractCta: computeShowContractCta(student.contracts),
    showCombinedWorkoutCta: computeShowCombinedWorkoutCta({
      workoutMethodMode,
      firstCompletedWorkoutDate,
    }),
  };

  const commercialImpactStatus = activeCarePause
    ? contract?.type === "TRIAL"
      ? "CONGELAR_EXPERIENCIA"
      : "AVALIAR_COMPENSACAO"
    : "SEM_IMPACTO";

  const commercialImpact = {
    status: commercialImpactStatus as "SEM_IMPACTO" | "CONGELAR_EXPERIENCIA" | "AVALIAR_COMPENSACAO",
    affectsTrainingDelivery: Boolean(activeCarePause),
    countsAsCompletedWorkout: false,
    countsAsAbsence: false,
    recommendedAction: activeCarePause
      ? contract?.type === "TRIAL"
        ? "Preservar os dias restantes da experiência até a revisão/liberação de retomada."
        : "Registrar para a gestão avaliar compensação, prorrogação ou crédito conforme política comercial."
      : null,
    preservedTrialDays,
    message: activeCarePause
      ? contract?.type === "TRIAL"
        ? "Pausa por cuidado ativa: a experiência não deve queimar dias sem janela real de treino."
        : "Pausa por cuidado ativa: não contar como falta, treino feito ou baixa adesão comum."
      : null,
  };

  return {
    student: {
      id: student.id,
      name: student.name,
      preferredName: student.preferredName,
      displayName: getStudentDisplayName(student),
      email: student.email,
      phone: student.phone,
      image: student.image || student.userAuth?.image || null,
      commercialStatus: student.commercialStatus,
      workoutMethodMode,
    },
    currentCycle: contract
      ? {
          id: contract.id,
          type: contract.type,
          status: contract.status,
          commercialStatus: contract.commercialStatus,
          startDate: toDateOnlyISOString(contract.startDate),
          endDate: toDateOnlyISOString(contract.endDate),
          daysLeft: typeof daysLeft === "number" ? daysLeft : getDaysLeft(contract.endDate),
          workoutsPerWeek: contract.workoutsPerWeek,
          workoutsPerMonth: contract.workoutsPerMonth,
          totalContractedWorkouts: contract.totalContractedWorkouts,
          priceCents: contract.priceCents,
          planName: contract.plan?.name || null,
        }
      : null,
    professor: professor
      ? {
          id: professor.id,
          name: professor.name,
          email: professor.email,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          dueDate: toDateOnlyISOString(payment.dueDate),
          paidAt: payment.paidAt ? toDateOnlyISOString(payment.paidAt) : null,
          amountCents: payment.amountCents,
          method: payment.method,
          paymentLinkUrl: payment.paymentLinkUrl || null,
        }
      : null,
    currentCarePause: activeCarePause
      ? {
          id: activeCarePause.id,
          eventType: activeCarePause.eventType,
          severity: activeCarePause.severity,
          status: activeCarePause.status,
          title: activeCarePause.title,
          description: activeCarePause.description,
          studentMessage: activeCarePause.studentMessage,
          createdAt: toDateOnlyISOString(activeCarePause.createdAt),
          updatedAt: toDateOnlyISOString(activeCarePause.updatedAt),
        }
      : null,
    commercialImpact,
    flags,
    uiState,
    hasActiveAccess: !shouldBlockTraining,
    shouldBlockTraining,
    title: text.title,
    message: text.message,
    actionLabel: text.actionLabel,
  };
}

export async function getStudentDashboardSummaryForSessionUser(input?: DashboardInput) {
  return getStudentDashboardSummary(input);
}
