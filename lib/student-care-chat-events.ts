import { prisma } from "@/lib/prisma";
import { classifyCareSignal } from "@/lib/student-training-preferences";
import {
  isTeacherUserId,
  resolveStudentProfessorId,
} from "@/lib/student-professor";

export type RegisterCareEventFromMessageInput = {
  rootConversationId: string;
  messageId: string;
  studentId: string;
  professorId?: string | null;
  authorId?: string | null;
  content: string;
  createdAt?: Date | null;
  notifyProfessor?: boolean;
};

export type RegisterCareEventResult = {
  action: "CREATED" | "UPDATED" | "IGNORED";
  eventId?: string;
  reason?: string;
};

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function findActiveContractId(studentId: string): Promise<string | null> {
  const now = new Date();

  const contract = await prisma.studentContract.findFirst({
    where: {
      studentId,
      status: {
        notIn: [
          "CANCELADO",
          "CANCELLED",
          "FINALIZADO",
          "FINALIZED",
          "INATIVO",
          "ENCERRADO",
        ],
      },
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
    select: {
      id: true,
    },
  });

  return contract?.id || null;
}

async function resolveNoticeAuthorId(preferredId?: string | null): Promise<string | null> {
  if (preferredId) {
    const exists = await prisma.user.findUnique({
      where: { id: preferredId },
      select: { id: true },
    });

    if (exists?.id) return exists.id;
  }

  const fallback = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN", "TEACHER", "PROFESSOR"],
      },
      active: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  return fallback?.id || null;
}

function buildTitle({
  studentName,
  requiresTrainingPause,
  isCritical,
}: {
  studentName: string;
  requiresTrainingPause: boolean;
  isCritical: boolean;
}): string {
  if (requiresTrainingPause) {
    return `${studentName} precisa de revisão antes de voltar a treinar`;
  }

  if (isCritical) {
    return `Atenção prioritária ao relato de ${studentName}`;
  }

  return `Revisar relato de cuidado de ${studentName}`;
}

function buildProfessorMessage(requiresTrainingPause: boolean): string {
  return requiresTrainingPause
    ? "Aluno sinalizou lesão, limitação ou dúvida sobre conseguir treinar. Não liberar treino normal enquanto o evento estiver aberto. Revisar o relato, orientar retomada segura e recomendar avaliação profissional quando necessário."
    : "Revisar o relato antes de liberar, evoluir carga, impacto, volume, complexidade ou intensidade dos próximos treinos.";
}

function buildDescription({
  rootConversationId,
  messageId,
  content,
  requiresTrainingPause,
}: {
  rootConversationId: string;
  messageId: string;
  content: string;
  requiresTrainingPause: boolean;
}): string {
  return [
    `Conversa: ${rootConversationId}`,
    `Mensagem: ${messageId}`,
    requiresTrainingPause
      ? "O aluno registrou possível lesão, limitação física ou dúvida sobre conseguir realizar o próximo treino."
      : "O aluno registrou dor, desconforto, torção, lesão, acidente ou outro sinal físico sensível no chat.",
    requiresTrainingPause
      ? "Não liberar treino normal enquanto este evento estiver aberto. O professor deve revisar o caso antes da retomada."
      : "Antes de evoluir ou liberar os próximos treinos, o professor deve revisar o relato e adaptar a prescrição se necessário.",
    "Relato do aluno:",
    content,
  ].join("\n");
}

async function createProfessorNotice({
  studentName,
  studentId,
  professorId,
  authorId,
  content,
  requiresTrainingPause,
  isCritical,
}: {
  studentName: string;
  studentId: string;
  professorId: string | null;
  authorId: string | null;
  content: string;
  requiresTrainingPause: boolean;
  isCritical: boolean;
}): Promise<string | null> {
  if (!professorId) return null;

  const noticeAuthorId = await resolveNoticeAuthorId(authorId || professorId);
  if (!noticeAuthorId) return null;

  const title = buildTitle({
    studentName,
    requiresTrainingPause,
    isCritical,
  });

  const notice = await prisma.notice.create({
    data: {
      title,
      content: [
        requiresTrainingPause
          ? `${studentName} sinalizou possível lesão ou dúvida sobre conseguir treinar.`
          : `${studentName} registrou ${isCritical ? "um cuidado prioritário" : "um alerta"} no chat.`,
        requiresTrainingPause
          ? "Não libere treino normal enquanto o evento estiver aberto. Revise o caso antes da retomada."
          : "Revise a conversa antes de liberar ou evoluir os próximos treinos.",
        "",
        `Relato: ${content}`,
      ].join("\n"),
      type: "CUIDADO_ALUNO",
      targetRole: "TEACHER",
      studentId,
      professorId,
      authorId: noticeAuthorId,
      expiresAt: addDays(new Date(), 30),
    },
    select: {
      id: true,
    },
  });

  return notice.id;
}

export async function registerCareEventFromStudentMessage({
  rootConversationId,
  messageId,
  studentId,
  professorId,
  authorId,
  content,
  createdAt,
  notifyProfessor = true,
}: RegisterCareEventFromMessageInput): Promise<RegisterCareEventResult> {
  const careClassification = classifyCareSignal(content);

  if (!careClassification.hasSignal) {
    return {
      action: "IGNORED",
      reason: "Mensagem sem sinal de cuidado.",
    };
  }

  const exactMessageEvent = await prisma.studentCareEvent.findFirst({
    where: {
      studentId,
      source: "CHAT_DUVIDAS",
      description: {
        contains: `Mensagem: ${messageId}`,
      },
    },
    select: {
      id: true,
    },
  });

  if (exactMessageEvent) {
    return {
      action: "IGNORED",
      eventId: exactMessageEvent.id,
      reason: "Mensagem já registrada em evento de cuidado.",
    };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  if (!student) {
    return {
      action: "IGNORED",
      reason: "Aluno não encontrado.",
    };
  }

  const effectiveProfessorId =
    professorId && (await isTeacherUserId(professorId))
      ? professorId
      : await resolveStudentProfessorId(studentId);

  const referenceDate = createdAt ? new Date(createdAt) : new Date();
  const { startOfWeek, endOfWeek } = getWeekRange(referenceDate);
  const contractId = await findActiveContractId(studentId);
  const studentName = student.name || "Aluno";
  const title = buildTitle({
    studentName,
    requiresTrainingPause: careClassification.requiresTrainingPause,
    isCritical: careClassification.isCritical,
  });
  const description = buildDescription({
    rootConversationId,
    messageId,
    content,
    requiresTrainingPause: careClassification.requiresTrainingPause,
  });
  const professorMessage = buildProfessorMessage(
    careClassification.requiresTrainingPause
  );

  const openConversationEvent = await prisma.studentCareEvent.findFirst({
    where: {
      studentId,
      source: "CHAT_DUVIDAS",
      status: {
        in: ["ABERTO", "REQUER_REVISAO", "EM_REVISAO"],
      },
      description: {
        contains: `Conversa: ${rootConversationId}`,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (openConversationEvent) {
    const mergedRequiresTrainingPause =
      openConversationEvent.eventType === "PAUSA_POR_CUIDADO" ||
      careClassification.requiresTrainingPause;
    const mergedIsCritical =
      openConversationEvent.severity === "CUIDADO" ||
      careClassification.isCritical;
    const mergedTitle = buildTitle({
      studentName,
      requiresTrainingPause: mergedRequiresTrainingPause,
      isCritical: mergedIsCritical,
    });
    const mergedProfessorMessage = buildProfessorMessage(
      mergedRequiresTrainingPause
    );
    const escalatedToPause =
      careClassification.requiresTrainingPause &&
      openConversationEvent.eventType !== "PAUSA_POR_CUIDADO";
    const shouldNotifyAgain =
      escalatedToPause ||
      careClassification.isCritical ||
      !openConversationEvent.professorNoticeId;

    let professorNoticeId = openConversationEvent.professorNoticeId || null;

    if (notifyProfessor && shouldNotifyAgain) {
      try {
        professorNoticeId = await createProfessorNotice({
          studentName,
          studentId,
          professorId: effectiveProfessorId,
          authorId: authorId || null,
          content,
          requiresTrainingPause: careClassification.requiresTrainingPause,
          isCritical: careClassification.isCritical,
        });
      } catch (noticeError) {
        console.error("Erro ao criar novo aviso de cuidado para o professor:", noticeError);
      }
    }

    const mergedDescription = [
      openConversationEvent.description || "",
      "",
      "--- Atualização recebida no chat ---",
      description,
    ]
      .filter(Boolean)
      .join("\n");

    const updated = await prisma.studentCareEvent.update({
      where: { id: openConversationEvent.id },
      data: {
        professorId: effectiveProfessorId,
        authorId: authorId || openConversationEvent.authorId || null,
        eventType: mergedRequiresTrainingPause
          ? "PAUSA_POR_CUIDADO"
          : "RELATO_DOR_DUVIDA",
        severity: mergedIsCritical ? "CUIDADO" : "ALERTA",
        status:
          openConversationEvent.status === "EM_REVISAO" &&
          !careClassification.requiresTrainingPause
            ? "EM_REVISAO"
            : careClassification.isCritical
              ? "REQUER_REVISAO"
              : openConversationEvent.status,
        title: mergedTitle,
        description: mergedDescription,
        studentMessage: content,
        professorMessage: mergedProfessorMessage,
        contractId: openConversationEvent.contractId || contractId,
        weekStart: startOfWeek,
        weekEnd: endOfWeek,
        professorNoticeId: professorNoticeId || openConversationEvent.professorNoticeId,
      },
      select: {
        id: true,
      },
    });

    return {
      action: "UPDATED",
      eventId: updated.id,
    };
  }

  let professorNoticeId: string | null = null;

  if (notifyProfessor) {
    try {
      professorNoticeId = await createProfessorNotice({
      studentName,
      studentId,
      professorId: effectiveProfessorId,
      authorId: authorId || null,
      content,
      requiresTrainingPause: careClassification.requiresTrainingPause,
      isCritical: careClassification.isCritical,
      });
    } catch (noticeError) {
      console.error("Erro ao criar aviso de cuidado para o professor:", noticeError);
    }
  }

  const created = await prisma.studentCareEvent.create({
    data: {
      studentId,
      professorId: effectiveProfessorId,
      authorId: authorId || null,
      eventType: careClassification.eventType,
      severity: careClassification.severity,
      status: careClassification.status,
      source: "CHAT_DUVIDAS",
      title,
      description,
      studentMessage: content,
      professorMessage,
      contractId,
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      professorNoticeId,
    },
    select: {
      id: true,
    },
  });

  return {
    action: "CREATED",
    eventId: created.id,
  };
}
