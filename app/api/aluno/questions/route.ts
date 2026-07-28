import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";
import {
  isTeacherUserId,
  repairConversationProfessor,
  repairInvalidConversationProfessors,
  resolveStudentProfessorId,
} from "@/lib/student-professor";
import {
  classifyCareSignal,
  registerTrainingPreferenceFromStudentMessage,
} from "@/lib/student-training-preferences";

function normalizeRole(value?: string | null): string {
  const roleValue = String(value || "").toUpperCase();

  if (roleValue === "ALUNO") return "STUDENT";
  if (roleValue === "PROFESSOR") return "TEACHER";

  return roleValue;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hasCareSignal(content: string): boolean {
  return classifyCareSignal(content).hasSignal;
}

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

type StudentQuestionEmailRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  panelKind: "TEACHER" | "GESTOR";
};

async function notifyNewStudentQuestionByEmail({
  studentId,
  teacherId,
}: {
  studentId: string;
  teacherId: string | null;
}) {
  const student = await prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const senderLabel = student?.name || "um aluno";
  let recipients: StudentQuestionEmailRecipient[] = [];

  if (teacherId) {
    const teacher = await prisma.user.findFirst({
      where: {
        id: teacherId,
        active: true,
        role: {
          in: ["PROFESSOR", "TEACHER"],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (teacher) {
      recipients = [{ ...teacher, panelKind: "TEACHER" }];
    }
  } else {
    const gestores = await prisma.user.findMany({
      where: {
        role: {
          in: ["GESTOR", "ADMIN"],
        },
        email: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    recipients = gestores.map((gestor) => ({
      ...gestor,
      panelKind: "GESTOR" as const,
    }));
  }

  const loginUrl = getAppLoginUrl();
  const safeSenderLabel = escapeHtml(senderLabel);

  await Promise.allSettled(
    recipients
      .filter((recipient) => Boolean(recipient.email))
      .map((recipient) => {
        const recipientName = recipient.name || "usuário";
        const isTeacher = recipient.panelKind === "TEACHER";
        const subject = isTeacher
          ? `${senderLabel} enviou uma nova mensagem pelo chat`
          : `Nova mensagem de aluno para acompanhamento: ${senderLabel}`;
        const actionText = isTeacher
          ? "Acesse o chat para ler e responder ao aluno. Manter a conversa na plataforma ajuda a registrar o acompanhamento e dá contexto para os próximos treinos."
          : "O aluno ainda não possui professor disponível nesta conversa. Acesse a gestão para ler a mensagem, orientar o próximo passo e manter o atendimento registrado.";

        const text = [
          `Oi, ${recipientName}!`,
          "",
          `${senderLabel} enviou uma nova mensagem pelo chat do Funcional VIP Digital.`,
          "",
          actionText,
          "",
          `Abrir conversa: ${loginUrl}`,
          "",
          "Funcional VIP Digital",
          "Aviso automático sobre uma mensagem real enviada pelo aluno.",
        ].join("\n");

        const html = `
          <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
            <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
              <h2 style="color:#D4A373;margin:0 0 16px;">Nova mensagem de aluno</h2>
              <p style="color:#f5f5f5;font-size:15px;line-height:1.6;">Oi, <strong>${escapeHtml(recipientName)}</strong>!</p>
              <p style="color:#d4d4d4;font-size:14px;line-height:1.6;"><strong style="color:#f5f5f5;">${safeSenderLabel}</strong> enviou uma nova mensagem pelo chat do Funcional VIP Digital.</p>
              <p style="color:#d4d4d4;font-size:14px;line-height:1.6;">${escapeHtml(actionText)}</p>
              <a href="${loginUrl}" style="display:inline-block;background:#D4A373;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:10px;">Abrir conversa</a>
              <p style="color:#6b7280;font-size:11px;line-height:1.5;margin-top:18px;">Aviso automático sobre uma mensagem real enviada pelo aluno.</p>
            </div>
          </div>
        `;

        return sendEmail({
          to: recipient.email as string,
          subject,
          text,
          html,
        });
      })
  );
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const body: Record<string, unknown> = {};

    form.forEach((value, key) => {
      if (typeof value === "string") {
        body[key] = value;
      } else if (value instanceof File) {
        body[key] = value;
      }
    });

    return body;
  }

  try {
    const json = await req.json();

    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }

    return {};
  } catch {
    return {};
  }
}


type ChatAttachmentResult = {
  imageUrl: string | null;
  videoUrl: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  error?: string;
};

const MAX_CHAT_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const CHAT_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const CHAT_DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt"]);

function getFileExtension(fileName: string): string {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function getDocumentMimeType(file: File): string {
  if (file.type) return file.type;

  const extension = getFileExtension(file.name);
  if (extension === "pdf") return "application/pdf";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "txt") return "text/plain";

  return "application/octet-stream";
}

function getFileFromBody(body: Record<string, unknown>): File | null {
  const value = body.file || body.attachment || body.image || body.video;

  if (!value || typeof value === "string") return null;
  if (!(value instanceof File)) return null;

  return value;
}

async function getChatAttachmentFromBody(body: Record<string, unknown>): Promise<ChatAttachmentResult> {
  const file = getFileFromBody(body);

  if (!file) {
    return {
      imageUrl: cleanId(body.imageUrl) || cleanId(body.image) || null,
      videoUrl: cleanId(body.videoUrl) || cleanId(body.video) || null,
      documentUrl: cleanId(body.documentUrl) || null,
      documentName: cleanId(body.documentName) || null,
      documentMimeType: cleanId(body.documentMimeType) || null,
    };
  }

  if (!file.size) {
    return { imageUrl: null, videoUrl: null, documentUrl: null, documentName: null, documentMimeType: null };
  }

  const fileType = String(file.type || "").toLowerCase();
  const fileExtension = getFileExtension(file.name);
  const isImage = fileType.startsWith("image/");
  const isVideo = fileType.startsWith("video/");
  const isDocument =
    CHAT_DOCUMENT_MIME_TYPES.has(fileType) ||
    CHAT_DOCUMENT_EXTENSIONS.has(fileExtension);

  if (!isImage && !isVideo && !isDocument) {
    return {
      imageUrl: null,
      videoUrl: null,
      documentUrl: null,
      documentName: null,
      documentMimeType: null,
      error: "Envie foto, vídeo, PDF, Word ou TXT no chat.",
    };
  }

  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    return {
      imageUrl: null,
      videoUrl: null,
      documentUrl: null,
      documentName: null,
      documentMimeType: null,
      error: isDocument
        ? "O documento precisa ter até 3 MB."
        : "Este anexo enviado diretamente precisa ter até 3 MB.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = isDocument ? getDocumentMimeType(file) : file.type;
  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;

  return {
    imageUrl: isImage ? dataUrl : null,
    videoUrl: isVideo ? dataUrl : null,
    documentUrl: isDocument ? dataUrl : null,
    documentName: isDocument ? file.name : null,
    documentMimeType: isDocument ? contentType : null,
  };
}

async function getStudentFromSessionOrId(
  userId: string,
  email?: string | null,
  studentId?: string | null
) {
  const normalizedEmail = String(email || "").trim();
  const sessionMatches = [
    ...(userId ? [{ userAuthId: userId }] : []),
    ...(normalizedEmail
      ? [
          { email: { equals: normalizedEmail, mode: "insensitive" as const } },
          {
            userAuth: {
              email: { equals: normalizedEmail, mode: "insensitive" as const },
            },
          },
        ]
      : []),
  ];

  if (sessionMatches.length === 0) return null;

  return prisma.student.findFirst({
    where: {
      active: true,
      ...(studentId ? { id: studentId } : {}),
      OR: sessionMatches,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      userAuthId: true,
    },
  });
}

function getQuestionIncludes() {
  return {
    student: {
      select: {
        id: true,
        name: true,
      },
    },
    teacher: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    answeredBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    children: {
      orderBy: {
        createdAt: "asc" as const,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        answeredBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    },
  };
}

async function findActiveContractIdForCareEvent(studentId: string): Promise<string | null> {
  const now = new Date();

  const contract = await prisma.studentContract.findFirst({
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
    select: {
      id: true,
    },
  });

  return contract?.id || null;
}

async function maybeCreateCareEventFromStudentQuestion({
  rootConversationId,
  studentId,
  professorId,
  authorId,
}: {
  rootConversationId: string;
  studentId: string;
  professorId: string | null;
  authorId: string;
}) {
  const rootConversation = await prisma.question.findUnique({
    where: {
      id: rootConversationId,
    },
    select: {
      id: true,
      content: true,
      senderRole: true,
      createdAt: true,
      children: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          content: true,
          senderRole: true,
          createdAt: true,
        },
      },
    },
  });

  if (!rootConversation) return;

  const messages = [
    {
      id: rootConversation.id,
      content: rootConversation.content,
      senderRole: rootConversation.senderRole,
      createdAt: rootConversation.createdAt,
    },
    ...rootConversation.children,
  ];

  const studentCareMessages = messages.filter(
    (message) => normalizeRole(message.senderRole) === "STUDENT" && hasCareSignal(message.content)
  );

  if (studentCareMessages.length === 0) return;

  const firstCareMessage = studentCareMessages[0];
  const careClassification = classifyCareSignal(firstCareMessage.content);

  if (!careClassification.hasSignal) return;

  const alreadyExists = await prisma.studentCareEvent.findFirst({
    where: {
      studentId,
      source: "CHAT_DUVIDAS",
      eventType: careClassification.eventType,
      status: {
        in: ["ABERTO", "REQUER_REVISAO", "EM_REVISAO"],
      },
      description: {
        contains: `Conversa: ${rootConversationId}`,
      },
    },
    select: {
      id: true,
    },
  });

  if (alreadyExists) return;

  const student = await prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  const effectiveProfessorId =
    professorId && (await isTeacherUserId(professorId))
      ? professorId
      : await resolveStudentProfessorId(studentId);
  const { startOfWeek, endOfWeek } = getWeekRange(firstCareMessage.createdAt || new Date());
  const contractId = await findActiveContractIdForCareEvent(studentId);
  const title = careClassification.requiresTrainingPause
    ? `${student?.name || "Aluno"} precisa de revisão antes de voltar a treinar`
    : careClassification.isCritical
      ? `Atenção prioritária ao relato de ${student?.name || "aluno"}`
      : `Revisar relato de cuidado de ${student?.name || "aluno"}`;
  const description = [
    `Conversa: ${rootConversationId}`,
    `Mensagem: ${firstCareMessage.id}`,
    careClassification.requiresTrainingPause
      ? "O aluno registrou uma mensagem indicando que está sem condição de treinar ou precisa pausar por cuidado."
      : "O aluno registrou uma mensagem com possível dor, desconforto, torção, lesão ou sinal físico sensível no chat/dúvidas.",
    careClassification.requiresTrainingPause
      ? "Não liberar novo treino normal enquanto este evento estiver aberto. O aluno deve informar aptidão para retomada e o professor deve revisar antes de voltar a prescrever."
      : "Antes de evoluir, repetir ou liberar a próxima semana de treinos, o professor deve revisar o relato e ajustar a prescrição se necessário.",
    "Relato do aluno:",
    firstCareMessage.content,
  ].join("\n");

  let professorNoticeId: string | null = null;

  if (effectiveProfessorId) {
    try {
      const notice = await prisma.notice.create({
        data: {
          title,
          content: [
            careClassification.requiresTrainingPause
              ? `${student?.name || "Aluno"} sinalizou que está sem condição de treinar e pode precisar de pausa por cuidado.`
              : `${student?.name || "Aluno"} registrou ${careClassification.isCritical ? "um possível cuidado crítico" : "um alerta"} de dor/desconforto no chat/dúvidas.`,
            careClassification.requiresTrainingPause
              ? "Não libere novo treino normal enquanto o alerta de pausa estiver aberto. Oriente retomada segura e, se necessário, avaliação profissional."
              : "Revise a conversa antes de liberar ou evoluir a próxima semana de treinos.",
            "",
            `Relato: ${firstCareMessage.content}`,
          ].join("\n"),
          type: "CUIDADO_ALUNO",
          targetRole: "TEACHER",
          studentId,
          professorId: effectiveProfessorId,
          authorId,
          expiresAt: addDays(new Date(), 30),
        },
        select: {
          id: true,
        },
      });

      professorNoticeId = notice.id;
    } catch (noticeError) {
      console.error("Erro ao criar aviso de cuidado para professor:", noticeError);
    }
  }

  await prisma.studentCareEvent.create({
    data: {
      studentId,
      professorId: effectiveProfessorId,
      authorId,
      eventType: careClassification.eventType,
      severity: careClassification.severity,
      status: careClassification.status,
      source: "CHAT_DUVIDAS",
      title,
      description,
      studentMessage: firstCareMessage.content,
      professorMessage: careClassification.requiresTrainingPause
        ? "Aluno sinalizou que está sem condição de treinar. Não liberar treino normal enquanto o evento estiver aberto. Orientar avaliação profissional quando necessário e revisar retomada segura quando o aluno informar aptidão."
        : "Revisar relato de dor/desconforto antes de liberar, evoluir carga, impacto, volume, complexidade ou intensidade da próxima semana.",
      contractId,
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      professorNoticeId,
    },
  });
}


async function maybeRegisterTrainingPreferenceFromStudentQuestion({
  messageId,
  rootConversationId,
  studentId,
  professorId,
  content,
}: {
  messageId: string;
  rootConversationId: string;
  studentId: string;
  professorId: string | null;
  content: string;
}) {
  return registerTrainingPreferenceFromStudentMessage({
    sourceMessageId: messageId,
    sourceConversationId: rootConversationId,
    studentId,
    professorId,
    content,
    source: "CHAT",
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = cleanId(searchParams.get("studentId"));
    const student = await getStudentFromSessionOrId(
      String(sessionUser.id),
      sessionUser.email,
      studentId
    );

    if (!student) {
      return NextResponse.json([]);
    }

    try {
      await repairInvalidConversationProfessors();
    } catch (repairError) {
      console.error("Erro ao corrigir destinatários antigos das conversas do aluno:", repairError);
    }

    const questions = await prisma.question.findMany({
      where: {
        studentId: student.id,
        parentId: null,
      },
      include: getQuestionIncludes(),
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("GET /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dúvidas" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await readBody(req);
    const userId = String(sessionUser.id);
    const attachment = await getChatAttachmentFromBody(body);

    if (attachment.error) {
      return NextResponse.json(
        { error: attachment.error },
        { status: 400 }
      );
    }

    let content = cleanText(body.content || body.question || body.message);
    const hasAttachment = Boolean(attachment.imageUrl || attachment.videoUrl || attachment.documentUrl);

    if (!content && hasAttachment) {
      content = attachment.videoUrl ? "Vídeo enviado pelo aluno." : attachment.documentUrl ? "Documento enviado pelo aluno." : "Imagem enviada pelo aluno.";
    }

    const studentIdFromBody = cleanId(body.studentId);
    const parentId = cleanId(body.parentId);
    const target = String(body.target || body.targetType || "PROFESSOR").toUpperCase();

    if (!content) {
      return NextResponse.json(
        { error: "Mensagem é obrigatória" },
        { status: 400 }
      );
    }

    const student = await getStudentFromSessionOrId(
      userId,
      sessionUser.email,
      studentIdFromBody
    );

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado" },
        { status: 404 }
      );
    }

    let rootQuestion: {
      id: string;
      studentId: string | null;
      teacherId: string | null;
      resolvedAt: Date | null;
    } | null = null;

    if (parentId) {
      const parent = await prisma.question.findUnique({
        where: {
          id: parentId,
        },
        select: {
          id: true,
          parentId: true,
          studentId: true,
          teacherId: true,
          resolvedAt: true,
        },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "Conversa não encontrada" },
          { status: 404 }
        );
      }

      rootQuestion = parent.parentId
        ? await prisma.question.findUnique({
            where: {
              id: parent.parentId,
            },
            select: {
              id: true,
              studentId: true,
              teacherId: true,
              resolvedAt: true,
            },
          })
        : parent;

      if (!rootQuestion) {
        return NextResponse.json(
          { error: "Conversa principal não encontrada" },
          { status: 404 }
        );
      }

      if (rootQuestion.resolvedAt) {
        return NextResponse.json(
          { error: "Esta conversa já foi encerrada" },
          { status: 400 }
        );
      }

      if (rootQuestion.studentId !== student.id) {
        return NextResponse.json(
          { error: "Você não tem permissão para responder esta conversa" },
          { status: 403 }
        );
      }
    }

    const sendToGestao =
      target === "GESTAO" ||
      target === "GESTÃO" ||
      target === "GESTOR" ||
      target === "MANAGEMENT";

    let teacherId: string | null = null;

    if (rootQuestion) {
      teacherId = rootQuestion.teacherId
        ? await repairConversationProfessor({
            rootQuestionId: rootQuestion.id,
            studentId: student.id,
            currentTeacherId: rootQuestion.teacherId,
          })
        : null;

      if (rootQuestion.teacherId && !teacherId) {
        return NextResponse.json(
          { error: "Esta conversa está sem um professor válido. Peça à gestão para revisar o vínculo." },
          { status: 400 }
        );
      }
    } else if (!sendToGestao) {
      teacherId = await resolveStudentProfessorId(student.id);

      if (!teacherId) {
        return NextResponse.json(
          { error: "Aluno sem professor vinculado" },
          { status: 400 }
        );
      }
    }

    const question = await prisma.question.create({
      data: {
        content,
        studentId: student.id,
        teacherId,
        parentId: rootQuestion?.id || null,
        senderRole: "STUDENT",
        answeredById: userId,
        imageUrl: attachment.imageUrl,
        videoUrl: attachment.videoUrl,
        documentUrl: attachment.documentUrl,
        documentName: attachment.documentName,
        documentMimeType: attachment.documentMimeType,
      },
      include: getQuestionIncludes(),
    });

    try {
      await maybeCreateCareEventFromStudentQuestion({
        rootConversationId: rootQuestion?.id || question.id,
        studentId: student.id,
        professorId: teacherId,
        authorId: userId,
      });
    } catch (careEventError) {
      console.error("Erro ao criar evento de cuidado a partir da dúvida do aluno:", careEventError);
    }


    try {
      await maybeRegisterTrainingPreferenceFromStudentQuestion({
        messageId: question.id,
        rootConversationId: rootQuestion?.id || question.id,
        studentId: student.id,
        professorId: teacherId,
        content,
      });
    } catch (preferenceError) {
      console.error("Erro ao registrar preferência de treino a partir do chat:", preferenceError);
    }

    if (!rootQuestion) {
      try {
        await notifyNewStudentQuestionByEmail({
          studentId: student.id,
          teacherId,
        });
      } catch (emailError) {
        console.error("Erro ao enviar e-mail de nova dúvida do aluno:", emailError);
      }
    }

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("POST /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao enviar dúvida" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const role = normalizeRole(String(sessionUser.role || ""));
    const userId = String(sessionUser.id);
    const body = await readBody(req);

    const questionId = cleanId(body.id || body.questionId);
    const answer = cleanText(body.answer || body.content);

    if (!questionId) {
      return NextResponse.json(
        { error: "ID da dúvida é obrigatório" },
        { status: 400 }
      );
    }

    if (!answer) {
      return NextResponse.json(
        { error: "Resposta é obrigatória" },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        teacherId: true,
        resolvedAt: true,
        student: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: "Dúvida não encontrada" },
        { status: 404 }
      );
    }

    const rootQuestion = question.parentId
      ? await prisma.question.findUnique({
          where: {
            id: question.parentId,
          },
          select: {
            id: true,
            studentId: true,
            teacherId: true,
            resolvedAt: true,
            student: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        })
      : question;

    if (!rootQuestion) {
      return NextResponse.json(
        { error: "Conversa principal não encontrada" },
        { status: 404 }
      );
    }

    if (rootQuestion.resolvedAt) {
      return NextResponse.json(
        { error: "Esta conversa já foi encerrada" },
        { status: 400 }
      );
    }

    const resolvedTeacherId =
      rootQuestion.teacherId && rootQuestion.studentId
        ? await repairConversationProfessor({
            rootQuestionId: rootQuestion.id,
            studentId: rootQuestion.studentId,
            currentTeacherId: rootQuestion.teacherId,
          })
        : null;

    const canAnswerAsTeacher =
      role === "TEACHER" && resolvedTeacherId === userId;

    const canAnswerAsGestor =
      (role === "GESTOR" || role === "ADMIN") && !resolvedTeacherId;

    if (!canAnswerAsTeacher && !canAnswerAsGestor) {
      return NextResponse.json(
        { error: "Você não tem permissão para responder esta conversa" },
        { status: 403 }
      );
    }

    const senderRole = canAnswerAsTeacher ? "TEACHER" : "GESTOR";
    const now = new Date();

    const reply = await prisma.question.create({
      data: {
        content: answer,
        answer,
        answeredAt: now,
        answeredById: userId,
        parentId: rootQuestion.id,
        studentId: rootQuestion.studentId,
        teacherId: resolvedTeacherId,
        senderRole,
      },
    });

    const updatedRoot = await prisma.question.findUnique({
      where: {
        id: rootQuestion.id,
      },
      include: getQuestionIncludes(),
    });

    return NextResponse.json({
      success: true,
      reply,
      question: updatedRoot,
    });
  } catch (error) {
    console.error("PUT /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao responder dúvida" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const currentUserId = String(sessionUser.id);
    const currentRole = normalizeRole(String(sessionUser.role || ""));

    const body = await readBody(req);
    const questionId = cleanId(body.id || body.questionId);
    const action = cleanText(body.action);

    if (!questionId) {
      return NextResponse.json(
        { error: "ID da dúvida é obrigatório" },
        { status: 400 }
      );
    }

    if (action !== "resolve") {
      return NextResponse.json(
        { error: "Ação inválida" },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: "Dúvida não encontrada" },
        { status: 404 }
      );
    }

    const rootQuestionId = question.parentId || question.id;

    const rootQuestion = await prisma.question.findUnique({
      where: {
        id: rootQuestionId,
      },
      select: {
        id: true,
        studentId: true,
        senderRole: true,
        answeredById: true,
        resolvedAt: true,
        student: {
          select: {
            id: true,
            userAuthId: true,
          },
        },
      },
    });

    if (!rootQuestion) {
      return NextResponse.json(
        { error: "Conversa principal não encontrada" },
        { status: 404 }
      );
    }

    const openerRole = normalizeRole(rootQuestion.senderRole);

    const canClose =
      currentRole === "STUDENT" &&
      openerRole === "STUDENT" &&
      Boolean(rootQuestion.student?.userAuthId) &&
      rootQuestion.student?.userAuthId === currentUserId &&
      rootQuestion.answeredById === currentUserId;

    if (!canClose) {
      return NextResponse.json(
        { error: "Apenas quem abriu esta conversa pode encerrá-la." },
        { status: 403 }
      );
    }

    const resolvedAt = rootQuestion.resolvedAt || new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedQuestion = await tx.question.update({
        where: {
          id: rootQuestionId,
        },
        data: {
          resolvedAt,
        },
        include: getQuestionIncludes(),
      });

      if (rootQuestion.studentId) {
        await tx.studentCareEvent.updateMany({
          where: {
            studentId: rootQuestion.studentId,
            source: "CHAT_DUVIDAS",
            eventType: "RELATO_DOR_DUVIDA",
            status: {
              in: ["ABERTO", "REQUER_REVISAO", "EM_REVISAO"],
            },
            description: {
              contains: `Conversa: ${rootQuestionId}`,
            },
          },
          data: {
            status: "RESOLVIDO",
            resolvedAt,
            resolvedById: currentUserId,
            resolutionNotes:
              "Dúvida encerrada pelo aluno no chat. Evento de cuidado fechado automaticamente; se a dor persistir, o aluno deve abrir nova conversa e o professor deve revisar a prescrição antes de evoluir.",
          },
        });
      }

      return updatedQuestion;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao encerrar dúvida" },
      { status: 500 }
    );
  }
}
