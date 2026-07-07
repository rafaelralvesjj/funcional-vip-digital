import { prisma } from "@/lib/prisma";

type SessionUserInput = {
  userId?: string | null;
  email?: string | null;
};

const ACTIVE_CYCLE_STATUSES = ["ACTIVE", "AWAITING_PAYMENT", "SUSPENDED"];
const OPEN_PAYMENT_STATUSES = ["EM_ABERTO", "ATRASADO", "PARCIAL"];

type ContractWithRelations = NonNullable<
  Awaited<ReturnType<typeof getStudentWithContracts>>
>["contracts"][number];

async function getStudentWithContracts({ userId, email }: SessionUserInput) {
  const orFilters = [];

  if (userId) {
    orFilters.push({ userAuthId: userId });
  }

  if (email) {
    orFilters.push({ email });
    orFilters.push({ userAuth: { email } });
  }

  if (orFilters.length === 0) {
    return null;
  }

  return prisma.student.findFirst({
    where: {
      active: true,
      OR: orFilters,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      commercialStatus: true,
      onboardingCompleto: true,
      createdAt: true,
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
          role: true,
        },
      },
      contracts: {
        where: {
          status: {
            in: ACTIVE_CYCLE_STATUSES,
          },
        },
        orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          contractNumber: true,
          type: true,
          status: true,
          commercialStatus: true,
          startDate: true,
          endDate: true,
          durationMonths: true,
          workoutsPerWeek: true,
          workoutsPerMonth: true,
          totalContractedWorkouts: true,
          priceCents: true,
          paymentMode: true,
          plan: {
            select: {
              id: true,
              name: true,
              description: true,
              workoutsPerWeek: true,
              workoutsPerMonth: true,
              priceCents: true,
              trialDays: true,
              allowTrial: true,
            },
          },
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          payments: {
            orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              amountCents: true,
              dueDate: true,
              paidAt: true,
              status: true,
              method: true,
              paymentLinkUrl: true,
              receiptUrl: true,
            },
          },
        },
      },
    },
  });
}

function diffDaysInclusive(endDate: Date, referenceDate = new Date()) {
  const end = new Date(endDate);
  const ref = new Date(referenceDate);

  end.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);

  return Math.ceil((end.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

function pickCurrentContract(contracts: ContractWithRelations[]) {
  const now = new Date();

  const activeInWindow = contracts.find(
    (contract) =>
      contract.status === "ACTIVE" &&
      contract.startDate.getTime() <= now.getTime() &&
      contract.endDate.getTime() >= now.getTime()
  );

  if (activeInWindow) return activeInWindow;

  const trialActive = contracts.find(
    (contract) =>
      contract.type === "TRIAL" &&
      contract.status === "ACTIVE" &&
      contract.endDate.getTime() >= now.getTime()
  );

  if (trialActive) return trialActive;

  const awaitingPayment = contracts.find(
    (contract) =>
      contract.status === "AWAITING_PAYMENT" &&
      contract.endDate.getTime() >= now.getTime()
  );

  if (awaitingPayment) return awaitingPayment;

  const suspended = contracts.find((contract) => contract.status === "SUSPENDED");
  if (suspended) return suspended;

  return contracts[0] ?? null;
}

function pickRelevantPayment(contract: ContractWithRelations | null) {
  if (!contract?.payments?.length) return null;

  const openPayment = contract.payments.find((payment) =>
    OPEN_PAYMENT_STATUSES.includes(payment.status)
  );

  if (openPayment) return openPayment;

  return contract.payments[0] ?? null;
}

function resolveProfessor(student: NonNullable<Awaited<ReturnType<typeof getStudentWithContracts>>>, contract: ContractWithRelations | null) {
  if (contract?.professor) return contract.professor;

  const legacyStudentUser = student.user;
  const legacyRole = legacyStudentUser?.role;

  if (legacyStudentUser && ["PROFESSOR", "TEACHER"].includes(legacyRole)) {
    return legacyStudentUser;
  }

  return null;
}

function resolveUiState({
  commercialStatus,
  contract,
  professor,
}: {
  commercialStatus: string;
  contract: ContractWithRelations | null;
  professor: ReturnType<typeof resolveProfessor>;
}) {
  if (!contract || commercialStatus === "SEM_CONTRATO_ATIVO") {
    return "SEM_CONTRATO_ATIVO" as const;
  }

  if (contract.status === "AWAITING_PAYMENT") {
    return "AGUARDANDO_PAGAMENTO" as const;
  }

  if (!professor) {
    return "AGUARDANDO_VINCULO_PROFESSOR" as const;
  }

  if (contract.type === "TRIAL" && contract.status === "ACTIVE") {
    return "EXPERIENCIA_ATIVA" as const;
  }

  if (contract.type === "PAID" && contract.status === "ACTIVE") {
    return "CONTRATO_ATIVO" as const;
  }

  if (contract.status === "SUSPENDED") {
    return "SUSPENSO_POR_PAGAMENTO" as const;
  }

  return commercialStatus as
    | "EXPERIENCIA_ATIVA"
    | "CONTRATO_ATIVO"
    | "AGUARDANDO_PAGAMENTO"
    | "AGUARDANDO_VINCULO_PROFESSOR"
    | "SUSPENSO_POR_PAGAMENTO"
    | "SEM_CONTRATO_ATIVO";
}

export async function getStudentDashboardSummaryForSessionUser({ userId, email }: SessionUserInput) {
  const student = await getStudentWithContracts({ userId, email });

  if (!student) {
    return null;
  }

  const currentContract = pickCurrentContract(student.contracts);
  const professor = resolveProfessor(student, currentContract);
  const payment = pickRelevantPayment(currentContract);
  const daysLeft = currentContract ? diffDaysInclusive(currentContract.endDate) : null;
  const isExpired = typeof daysLeft === "number" ? daysLeft < 0 : false;
  const needsProfessorAssignment = Boolean(currentContract && !professor);

  const uiState = resolveUiState({
    commercialStatus: student.commercialStatus,
    contract: currentContract,
    professor,
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      commercialStatus: student.commercialStatus,
      onboardingCompleto: student.onboardingCompleto,
    },
    currentCycle: currentContract
      ? {
          id: currentContract.id,
          contractNumber: currentContract.contractNumber,
          type: currentContract.type,
          status: currentContract.status,
          commercialStatus: currentContract.commercialStatus,
          startDate: currentContract.startDate,
          endDate: currentContract.endDate,
          daysLeft,
          isExpired,
          durationMonths: currentContract.durationMonths,
          workoutsPerWeek: currentContract.workoutsPerWeek,
          workoutsPerMonth: currentContract.workoutsPerMonth,
          totalContractedWorkouts: currentContract.totalContractedWorkouts,
          priceCents: currentContract.priceCents,
          paymentMode: currentContract.paymentMode,
          plan: currentContract.plan
            ? {
                id: currentContract.plan.id,
                name: currentContract.plan.name,
                description: currentContract.plan.description,
                workoutsPerWeek: currentContract.plan.workoutsPerWeek,
                workoutsPerMonth: currentContract.plan.workoutsPerMonth,
                priceCents: currentContract.plan.priceCents,
                trialDays: currentContract.plan.trialDays,
                allowTrial: currentContract.plan.allowTrial,
              }
            : null,
        }
      : null,
    professor: professor
      ? {
          id: professor.id,
          name: professor.name,
          email: professor.email,
          role: professor.role,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          amountCents: payment.amountCents,
          dueDate: payment.dueDate,
          paidAt: payment.paidAt,
          status: payment.status,
          method: payment.method,
          paymentLinkUrl: payment.paymentLinkUrl,
          receiptUrl: payment.receiptUrl,
        }
      : null,
    flags: {
      needsProfessorAssignment,
      isTrial: currentContract?.type === "TRIAL",
      isPaidContract: currentContract?.type === "PAID",
      isAwaitingPayment: currentContract?.status === "AWAITING_PAYMENT",
      isSuspended: currentContract?.status === "SUSPENDED",
      isExpired,
    },
    uiState,
  };
}

export type StudentDashboardSummary = Awaited<
  ReturnType<typeof getStudentDashboardSummaryForSessionUser>
>;
