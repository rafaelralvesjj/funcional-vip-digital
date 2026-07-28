import { prisma } from "@/lib/prisma";

const TEACHER_ROLES = new Set(["PROFESSOR", "TEACHER"]);
const TERMINAL_CONTRACT_STATUSES = new Set([
  "CANCELADO",
  "CANCELLED",
  "FINALIZADO",
  "FINALIZED",
  "INATIVO",
  "ENCERRADO",
]);

type ProfessorSummary = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

function normalizeRole(value?: string | null): string {
  const role = String(value || "").trim().toUpperCase();
  return role === "PROFESSOR" ? "TEACHER" : role;
}

function isTeacherRole(value?: string | null): boolean {
  return TEACHER_ROLES.has(String(value || "").trim().toUpperCase());
}

function isUsableContractStatus(value?: string | null): boolean {
  return !TERMINAL_CONTRACT_STATUSES.has(String(value || "").trim().toUpperCase());
}

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function contractPriority(contract: {
  status: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}): number {
  const now = Date.now();
  const start = toTimestamp(contract.startDate);
  const end = toTimestamp(contract.endDate);
  const status = String(contract.status || "").toUpperCase();

  let score = 0;

  if (start <= now && end >= now) score += 1_000_000;
  if (status === "ACTIVE" || status === "ATIVO") score += 500_000;
  if (start <= now) score += 100_000;

  score += Math.floor(start / 1_000_000_000);
  score += Math.floor(toTimestamp(contract.createdAt) / 10_000_000_000);

  return score;
}

export async function isTeacherUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      active: true,
      role: {
        in: ["PROFESSOR", "TEACHER"],
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(user);
}

export async function resolveStudentProfessor(studentId: string): Promise<ProfessorSummary | null> {
  const student = await prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      },
      contracts: {
        where: {
          professorId: {
            not: null,
          },
        },
        select: {
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
            },
          },
        },
      },
    },
  });

  if (!student) return null;

  const contractCandidates = student.contracts
    .filter(
      (contract) =>
        isUsableContractStatus(contract.status) &&
        contract.professor?.active !== false &&
        isTeacherRole(contract.professor?.role)
    )
    .sort((a, b) => contractPriority(b) - contractPriority(a));

  const selectedContract = contractCandidates[0] || null;
  const selectedProfessor = selectedContract?.professor || null;

  if (selectedProfessor) {
    const status = String(selectedContract?.status || "").toUpperCase();
    const now = Date.now();
    const isCurrentPeriod =
      toTimestamp(selectedContract?.startDate) <= now &&
      toTimestamp(selectedContract?.endDate) >= now;
    const shouldSyncLegacyLink =
      isCurrentPeriod || status === "ACTIVE" || status === "ATIVO";

    if (shouldSyncLegacyLink && student.userId !== selectedProfessor.id) {
      await prisma.student.update({
        where: {
          id: student.id,
        },
        data: {
          userId: selectedProfessor.id,
        },
      });
    }

    return {
      id: selectedProfessor.id,
      name: selectedProfessor.name,
      email: selectedProfessor.email,
      role: normalizeRole(selectedProfessor.role),
    };
  }

  if (student.user?.active !== false && isTeacherRole(student.user?.role)) {
    return {
      id: student.user.id,
      name: student.user.name,
      email: student.user.email,
      role: normalizeRole(student.user.role),
    };
  }

  return null;
}

export async function resolveStudentProfessorId(studentId: string): Promise<string | null> {
  const professor = await resolveStudentProfessor(studentId);
  return professor?.id || null;
}

export async function isStudentAssignedToProfessor(
  studentId: string,
  professorId: string
): Promise<boolean> {
  const assignedProfessorId = await resolveStudentProfessorId(studentId);
  return assignedProfessorId === professorId;
}

export async function repairConversationProfessor({
  rootQuestionId,
  studentId,
  currentTeacherId,
}: {
  rootQuestionId: string;
  studentId: string;
  currentTeacherId: string | null;
}): Promise<string | null> {
  if (!currentTeacherId) return null;

  if (await isTeacherUserId(currentTeacherId)) {
    return currentTeacherId;
  }

  const resolvedProfessorId = await resolveStudentProfessorId(studentId);

  if (resolvedProfessorId === currentTeacherId) {
    return currentTeacherId;
  }

  await prisma.$transaction([
    prisma.question.updateMany({
      where: {
        OR: [
          { id: rootQuestionId },
          { parentId: rootQuestionId },
        ],
      },
      data: {
        teacherId: resolvedProfessorId,
      },
    }),
    prisma.studentTrainingPreference.updateMany({
      where: {
        sourceConversationId: rootQuestionId,
      },
      data: {
        professorId: resolvedProfessorId,
      },
    }),
    prisma.studentCareEvent.updateMany({
      where: {
        studentId,
        description: {
          contains: `Conversa: ${rootQuestionId}`,
        },
      },
      data: {
        professorId: resolvedProfessorId,
      },
    }),
  ]);

  return resolvedProfessorId;
}

export async function repairInvalidConversationProfessors(): Promise<number> {
  const conversations = await prisma.question.findMany({
    where: {
      parentId: null,
      teacherId: {
        not: null,
      },
    },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      teacher: {
        select: {
          role: true,
          active: true,
        },
      },
    },
  });

  const invalidConversations = conversations.filter(
    (conversation) =>
      Boolean(conversation.studentId) &&
      Boolean(conversation.teacherId) &&
      (conversation.teacher?.active === false || !isTeacherRole(conversation.teacher?.role))
  );

  let repaired = 0;

  for (const conversation of invalidConversations) {
    if (!conversation.studentId) continue;

    const nextProfessorId = await repairConversationProfessor({
      rootQuestionId: conversation.id,
      studentId: conversation.studentId,
      currentTeacherId: conversation.teacherId,
    });

    if (nextProfessorId !== conversation.teacherId) {
      repaired += 1;
    }
  }

  return repaired;
}
