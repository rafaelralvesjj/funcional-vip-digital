import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { resolveStudentRecipientEmail } from "@/lib/email-recipient-policy";
import { notifyProfessorAboutStudentChatMessage, notifyStudentAboutChatReply } from "@/lib/chat-communications";
import {
  isStudentAssignedToProfessor,
  isTeacherUserId,
  repairConversationProfessor,
  repairInvalidConversationProfessors,
  resolveStudentProfessorId,
} from "@/lib/student-professor";
import { registerTrainingPreferenceFromStudentMessage } from "@/lib/student-training-preferences";
import { registerCareEventFromStudentMessage } from "@/lib/student-care-chat-events";

type SenderRole = "GESTOR" | "TEACHER" | "STUDENT";

function normalizeRole(value?: string | null): string {
  const roleValue = String(value || "").toUpperCase();

  if (roleValue === "ALUNO") return "STUDENT";
  if (roleValue === "PROFESSOR") return "TEACHER";

  return roleValue;
}

function getSenderRole(value: unknown, fallback: string): SenderRole {
  const role = normalizeRole(typeof value === "string" ? value : fallback);

  if (role === "STUDENT") return "STUDENT";
  if (role === "TEACHER") return "TEACHER";

  return "GESTOR";
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
  const isImage = fileType.startsWith("image/");
  const isVideo = fileType.startsWith("video/");

  if (!isImage && !isVideo) {
    return {
      imageUrl: null,
      videoUrl: null,
      documentUrl: null,
      documentName: null,
      documentMimeType: null,
      error: "Envie apenas imagem ou vídeo no chat.",
    };
  }

  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    return {
      imageUrl: null,
      videoUrl: null,
      documentUrl: null,
      documentName: null,
      documentMimeType: null,
      error: "O anexo precisa ter até 3MB. Envie uma foto comprimida ou um vídeo curto.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  return {
    imageUrl: isImage ? dataUrl : null,
    videoUrl: isVideo ? dataUrl : null,
    documentUrl: null,
    documentName: null,
    documentMimeType: null,
  };
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

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

type ConversationEmailRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  userAuthId?: string | null;
  panelKind: "STUDENT" | "TEACHER" | "GESTOR";
};

async function sendNewConversationEmail({
  recipients,
  senderLabel,
}: {
  recipients: ConversationEmailRecipient[];
  senderLabel: string;
}) {
  const loginUrl = getAppLoginUrl();
  const safeSenderLabel = escapeHtml(senderLabel);

  await Promise.allSettled(
    recipients
      .filter((recipient) => Boolean(recipient.email))
      .map(async (recipient) => {
        const safeRecipientEmail = recipient.panelKind === "STUDENT"
          ? await resolveStudentRecipientEmail({ studentId: recipient.id, studentEmail: recipient.email, userAuthId: recipient.userAuthId || null })
          : recipient.email;

        if (!safeRecipientEmail) return;

        const recipientName = recipient.name || "usuário";
        const panelText =
          recipient.panelKind === "STUDENT"
            ? "seu painel do aluno"
            : recipient.panelKind === "TEACHER"
              ? "seu painel do professor"
              : "seu painel da gestão";

        const subject = "Nova mensagem no Funcional UP Digital";

        const text = [
          `Olá, ${recipientName}!`,
          "",
          `Você recebeu uma nova mensagem de ${senderLabel} no Funcional UP Digital.`,
          "",
          `Para visualizar, acesse ${panelText}.`,
          "",
          `Entrar no sistema: ${loginUrl}`,
        ].join("\n");

        const html = `
          <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
              <h2 style="color:#00A19C; margin:0 0 16px;">Nova mensagem</h2>

              <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
                Olá, ${escapeHtml(recipientName)}!
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Você recebeu uma nova mensagem de <strong style="color:#f5f5f5;">${safeSenderLabel}</strong> no Funcional UP Digital.
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Para visualizar, acesse ${panelText}.
              </p>

              <a href="${loginUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
                Acessar o sistema
              </a>

              <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
                Este é um aviso automático do Funcional UP Digital.
              </p>
            </div>
          </div>
        `;

        return sendEmail({
          to: safeRecipientEmail,
          subject,
          text,
          html,
        });
      })
  );
}

async function notifyNewConversationByEmail({
  senderRole,
  senderUserId,
  studentId,
  teacherId,
}: {
  senderRole: SenderRole;
  senderUserId: string;
  studentId: string | null;
  teacherId: string | null;
}) {
  let recipients: ConversationEmailRecipient[] = [];
  let senderLabel = "alguém";

  if (senderRole === "STUDENT") {
    const student = studentId
      ? await prisma.student.findUnique({
          where: { id: studentId },
          select: { id: true, name: true },
        })
      : null;

    senderLabel = student?.name || "um aluno";

    if (teacherId) {
      const teacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { id: true, name: true, email: true },
      });

      if (teacher) {
        recipients = [{ ...teacher, panelKind: "TEACHER" }];
      }
    }
  } else if (senderRole === "TEACHER") {
    const teacher = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { id: true, name: true },
    });

    senderLabel = teacher?.name || "seu professor";

    if (studentId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true, userAuthId: true },
      });

      if (student) {
        recipients = [{ ...student, panelKind: "STUDENT" }];
      }
    }
  } else {
    const gestor = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { id: true, name: true },
    });

    senderLabel = gestor?.name || "gestão";

    if (teacherId && !studentId) {
      const teacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { id: true, name: true, email: true },
      });

      if (teacher) {
        recipients = [{ ...teacher, panelKind: "TEACHER" }];
      }
    } else if (studentId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true, userAuthId: true },
      });

      if (student) {
        recipients = [{ ...student, panelKind: "STUDENT" }];
      }
    }
  }

  await sendNewConversationEmail({
    recipients,
    senderLabel,
  });
}

function getSessionUser(session: unknown): { id?: string; role?: string } {
  if (!session || typeof session !== "object") return {};

  const sessionObj = session as { user?: unknown };

  if (!sessionObj.user || typeof sessionObj.user !== "object") return {};

  const userObj = sessionObj.user as { id?: unknown; role?: unknown };

  return {
    id: typeof userObj.id === "string" ? userObj.id : undefined,
    role: typeof userObj.role === "string" ? userObj.role : undefined,
  };
}

async function validateStudent(studentId: string) {
  return prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });
}

async function validateTeacher(teacherId: string) {
  return prisma.user.findFirst({
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
      role: true,
    },
  });
}

async function isStudentLinkedToTeacher(studentId: string, teacherId: string): Promise<boolean> {
  return isStudentAssignedToProfessor(studentId, teacherId);
}

async function maybeCreateCareEventFromQuestion({
  rootConversationId,
  messageId,
  studentId,
  professorId,
  authorId,
  content,
  createdAt,
}: {
  rootConversationId: string;
  messageId: string;
  studentId: string | null;
  professorId: string | null;
  authorId: string;
  content: string;
  createdAt?: Date | null;
}) {
  if (!studentId) return null;

  return registerCareEventFromStudentMessage({
    rootConversationId,
    messageId,
    studentId,
    professorId,
    authorId,
    content,
    createdAt,
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    try {
      await repairInvalidConversationProfessors();
    } catch (repairError) {
      console.error("Erro ao corrigir destinatários antigos das conversas:", repairError);
    }

    const { searchParams } = new URL(req.url);
    const userId = sessionUser.id;
    const role = normalizeRole(sessionUser.role);

    const studentId = cleanId(searchParams.get("studentId"));
    const teacherId = cleanId(searchParams.get("teacherId"));
    const senderRole = cleanId(searchParams.get("senderRole"));
    const parentId = cleanId(searchParams.get("parentId"));

    const where: any = {};

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (parentId) where.parentId = parentId;
    if (senderRole) where.senderRole = normalizeRole(senderRole);

    if (!parentId) {
      where.parentId = null;
    }

    if (role === "TEACHER") {
      const linkedStudents = await prisma.student.findMany({
        where: {
          OR: [
            { userId },
            {
              contracts: {
                some: {
                  professorId: userId,
                  status: {
                    notIn: ["CANCELADO", "CANCELLED", "FINALIZADO", "FINALIZED", "INATIVO", "ENCERRADO"],
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      const linkedStudentIds = linkedStudents.map((student) => student.id);

      where.OR = [
        {
          teacherId: userId,
        },
        {
          teacherId: {
            not: null,
          },
          studentId: {
            in: linkedStudentIds,
          },
        },
      ];

      if (studentId) {
        where.studentId = studentId;
      }
    }

    if (role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: {
          userAuthId: userId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return NextResponse.json([]);
      }

      where.studentId = student.id;
    }

    const questions = await prisma.question.findMany({
      where,
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
        children: {
          orderBy: {
            createdAt: "asc",
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
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar mensagens" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = sessionUser.id;
    const loggedRole = normalizeRole(sessionUser.role);
    const body = await readBody(req);
    const attachment = await getChatAttachmentFromBody(body);

    if (attachment.error) {
      return NextResponse.json(
        { error: attachment.error },
        { status: 400 }
      );
    }

    let content = cleanText(body.content);
    const hasAttachment = Boolean(attachment.imageUrl || attachment.videoUrl || attachment.documentUrl);

    if (!content && hasAttachment) {
      content = attachment.videoUrl ? "Vídeo enviado na conversa." : attachment.documentUrl ? "Documento enviado na conversa." : "Imagem enviada na conversa.";
    }

    const requestedParentId = cleanId(body.parentId);
    const requestedStudentId = cleanId(body.studentId);
    const requestedTeacherId = cleanId(body.teacherId);
    const videoUrl = attachment.videoUrl || cleanId(body.videoUrl);
    const imageUrl = attachment.imageUrl || cleanId(body.imageUrl);
    const documentUrl = attachment.documentUrl || cleanId(body.documentUrl);
    const documentName = attachment.documentName || cleanId(body.documentName);
    const documentMimeType = attachment.documentMimeType || cleanId(body.documentMimeType);
    const senderRole: SenderRole =
      loggedRole === "TEACHER"
        ? "TEACHER"
        : loggedRole === "STUDENT"
          ? "STUDENT"
          : "GESTOR";

    if (!content) {
      return NextResponse.json(
        { error: "Mensagem é obrigatória" },
        { status: 400 }
      );
    }

    let parentId: string | null = null;
    let studentId: string | null = requestedStudentId;
    let teacherId: string | null = requestedTeacherId;

    if (requestedParentId) {
      const parentQuestion = await prisma.question.findUnique({
        where: {
          id: requestedParentId,
        },
        select: {
          id: true,
          parentId: true,
          studentId: true,
          teacherId: true,
          resolvedAt: true,
        },
      });

      if (!parentQuestion) {
        return NextResponse.json(
          { error: "Conversa original não encontrada" },
          { status: 404 }
        );
      }

      const rootQuestion = parentQuestion.parentId
        ? await prisma.question.findUnique({
            where: {
              id: parentQuestion.parentId,
            },
            select: {
              id: true,
              studentId: true,
              teacherId: true,
              resolvedAt: true,
            },
          })
        : parentQuestion;

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

      parentId = rootQuestion.id;
      studentId = rootQuestion.studentId || studentId || null;
      teacherId =
        rootQuestion.teacherId && rootQuestion.studentId
          ? await repairConversationProfessor({
              rootQuestionId: rootQuestion.id,
              studentId: rootQuestion.studentId,
              currentTeacherId: rootQuestion.teacherId,
            })
          : rootQuestion.teacherId || null;
    }

    /*
     * Regras:
     * - aluno pode enviar para professor: studentId + teacherId.
     * - aluno pode enviar para gestão: studentId sem teacherId.
     * - gestor pode enviar/responder para aluno ou professor.
     * - professor pode iniciar conversa com aluno vinculado ou com a gestão.
     * - professor também pode responder conversas em que ele é o teacherId.
     */
    if (loggedRole === "TEACHER" && !parentId && !studentId && !teacherId) {
      // Conversa iniciada pelo professor com a gestão.
      // O próprio professor fica registrado em teacherId para manter o vínculo do fio.
      teacherId = userId;
    }

    if (!studentId && !teacherId) {
      return NextResponse.json(
        { error: "Selecione um aluno ou professor para a conversa" },
        { status: 400 }
      );
    }

    let validatedStudent: Awaited<ReturnType<typeof validateStudent>> = null;

    if (studentId) {
      validatedStudent = await validateStudent(studentId);

      if (!validatedStudent) {
        return NextResponse.json(
          { error: "Aluno não encontrado" },
          { status: 404 }
        );
      }

      if (loggedRole === "TEACHER") {
        if (parentId && teacherId && teacherId !== userId) {
          return NextResponse.json(
            { error: "Esta conversa foi direcionada a outro professor e não pode ser respondida por você." },
            { status: 403 }
          );
        }

        // Uma resposta em fio já direcionado ao professor continua permitida.
        // Para iniciar uma conversa ou assumir um fio antigo sem teacherId,
        // o aluno precisa estar vinculado diretamente ou por contrato.
        if (!parentId || !teacherId) {
          const isLinkedStudent = await isStudentLinkedToTeacher(studentId, userId);

          if (!isLinkedStudent) {
            return NextResponse.json(
              { error: "Você só pode iniciar ou responder conversas com alunos vinculados a você" },
              { status: 403 }
            );
          }
        }

        // Em conversa professor-aluno, o professor autenticado é sempre o teacherId.
        // Isso evita que o cliente informe outro professor e mantém a segurança do vínculo.
        teacherId = userId;
      } else if (loggedRole === "STUDENT" && !teacherId) {
        teacherId = await resolveStudentProfessorId(studentId);

        if (!teacherId) {
          return NextResponse.json(
            { error: "Aluno sem professor vinculado" },
            { status: 400 }
          );
        }
      }
    }

    if (teacherId) {
      const teacher = await validateTeacher(teacherId);

      if (!teacher) {
        return NextResponse.json(
          { error: "Professor não encontrado" },
          { status: 404 }
        );
      }
    }

    if (loggedRole === "TEACHER" && teacherId && teacherId !== userId) {
      return NextResponse.json(
        { error: "Você não tem permissão para acessar esta conversa" },
        { status: 403 }
      );
    }

    const isReply = Boolean(parentId);
    const isAnswerFromStaff = isReply && senderRole !== "STUDENT";
    const answeredById = userId;

    const question = await prisma.question.create({
      data: {
        content,
        parentId,
        studentId,
        teacherId,
        senderRole,
        answeredById,
        videoUrl,
        imageUrl,
        documentUrl,
        documentName,
        documentMimeType,
        ...(isAnswerFromStaff
          ? {
              answer: content,
              answeredAt: new Date(),
            }
          : {}),
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
        children: {
          orderBy: {
            createdAt: "asc",
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
      },
    });

    const rootConversationId = parentId || question.id;

    try {
      if (senderRole === "STUDENT") {
        await maybeCreateCareEventFromQuestion({
          rootConversationId,
          messageId: question.id,
          studentId,
          professorId: teacherId,
          authorId: userId,
          content: question.content,
          createdAt: question.createdAt,
        });
      }
    } catch (careEventError) {
      console.error("Erro ao criar evento de cuidado a partir do chat/dúvidas:", careEventError);
    }

    try {
      if (senderRole === "STUDENT" && studentId) {
        await registerTrainingPreferenceFromStudentMessage({
          sourceMessageId: question.id,
          sourceConversationId: rootConversationId,
          studentId,
          professorId: teacherId,
          content: question.content,
          source: "CHAT",
          referenceDate: question.createdAt,
        });
      }
    } catch (preferenceError) {
      console.error("Erro ao registrar mudança de treino a partir do chat/dúvidas:", preferenceError);
    }

    try {
      if (senderRole === "STUDENT" && studentId) {
        await notifyProfessorAboutStudentChatMessage({
          studentId,
          professorId: teacherId,
          authorId: userId,
          conversationId: rootConversationId,
          messageText: content,
        });
      } else if (isAnswerFromStaff && studentId) {
        const senderName =
          String(question.answeredBy?.name || question.teacher?.name || "").trim() ||
          (senderRole === "GESTOR" ? "Equipe Funcional UP Digital" : "Seu professor");

        await notifyStudentAboutChatReply({
          studentId,
          authorId: userId,
          senderName,
          conversationId: rootConversationId,
          replyText: content,
        });
      } else if (!parentId) {
        await notifyNewConversationByEmail({
          senderRole,
          senderUserId: userId,
          studentId,
          teacherId,
        });
      }
    } catch (communicationError) {
      console.error("Erro ao gerar comunicação do chat:", communicationError);
    }

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao enviar mensagem" },
      { status: 500 }
    );
  }
}
