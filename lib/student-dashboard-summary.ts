import { prisma } from "@/lib/prisma";

export type StudentDashboardUiState =
  | "EXPERIENCIA_ATIVA"
  | "CONTRATO_ATIVO"
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
    email: string | null;
    phone: string | null;
    commercialStatus: string;
  };
  currentCycle: {
    id: string;
    type: string;
    status: string;
    commercialStatus: string;
    startDate: string;
    endDate: string;
    daysLeft: number;
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
  flags: {
    isTrial: boolean;
    isPaid: boolean;
    isAwaitingPayment: boolean;
    isWithoutActiveContract: boolean;
    isTrainingBlocked: boolean;
    hasProfessor: boolean;
    hasPaymentIssue: boolean;
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

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function moneyRelevantPayment(payments: any[]) {
  if (!payments?.length) return null;

  const priority = ["ATRASADO", "EM_ABERTO", "PARCIAL", "PAGO"];

  return [...payments].sort((a, b) => {
    const aPriority = priority.indexOf(a.status);
    const bPriority = priority.indexOf(b.status);

    if (aPriority !== bPriority) {
      return (aPriority === -1 ? 99 : aPriority) - (bPriority === -1 ? 99 : bPriority);
    }

    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  })[0];
}

function pickCurrentContract(contracts: any[]) {
  if (!contracts?.length) return null;

  const today = startOfDay(new Date());

  const activeOrAwaiting = contracts.find((contract) => {
    const endDate = startOfDay(new Date(contract.endDate));
    const isNotExpired = endDate.getTime() >= today.getTime();

    return (
      isNotExpired &&
      ["ACTIVE", "AWAITING_PAYMENT", "SUSPENDED"].includes(contract.status)
    );
  });

  if (activeOrAwaiting) return activeOrAwaiting;

  const trialStillValid = contracts.find((contract) => {
    const endDate = startOfDay(new Date(contract.endDate));
    return contract.type === "TRIAL" && endDate.getTime() >= today.getTime();
  });

  if (trialStillValid) return trialStillValid;

  return contracts[0] || null;
}

function buildUiState(params: {
  contract: any | null;
  payment: any | null;
  professor: any | null;
}): StudentDashboardUiState {
  const { contract, payment, professor } = params;

  if (!contract) return "SEM_CONTRATO_ATIVO";

  const daysLeft = getDaysLeft(contract.endDate);
  const isExpired = daysLeft < 0;
  const inactiveContractStatus = ["FINALIZED", "CANCELLED"].includes(contract.status);

  if (isExpired || inactiveContractStatus) return "SEM_CONTRATO_ATIVO";

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
          role: true,
        },
      },
      userAuth: {
        select: {
          id: true,
          name: true,
          email: true,
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
    },
  });

  if (!student) return null;

  const contract = pickCurrentContract(student.contracts);
  const payment = moneyRelevantPayment(contract?.payments || []);

  const fallbackProfessor = ["PROFESSOR", "TEACHER"].includes(student.user?.role)
    ? student.user
    : null;

  const professor = contract?.professor || fallbackProfessor || null;
  const uiState = buildUiState({ contract, payment, professor });
  const daysLeft = contract ? getDaysLeft(contract.endDate) : undefined;
  const text = buildText(uiState, daysLeft);

  const shouldBlockTraining = [
    "SEM_CONTRATO_ATIVO",
    "SUSPENSO_POR_PAGAMENTO",
    "AGUARDANDO_PAGAMENTO",
    "AGUARDANDO_VINCULO_PROFESSOR",
  ].includes(uiState);

  const flags = {
    isTrial: contract?.type === "TRIAL",
    isPaid: contract?.type === "PAID",
    isAwaitingPayment: uiState === "AGUARDANDO_PAGAMENTO",
    isWithoutActiveContract: uiState === "SEM_CONTRATO_ATIVO",
    isTrainingBlocked: shouldBlockTraining,
    hasProfessor: Boolean(professor),
    hasPaymentIssue: ["ATRASADO", "EM_ABERTO", "PARCIAL"].includes(payment?.status || ""),
  };

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      commercialStatus: student.commercialStatus,
    },
    currentCycle: contract
      ? {
          id: contract.id,
          type: contract.type,
          status: contract.status,
          commercialStatus: contract.commercialStatus,
          startDate: toDateOnlyISOString(contract.startDate),
          endDate: toDateOnlyISOString(contract.endDate),
          daysLeft: getDaysLeft(contract.endDate),
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
