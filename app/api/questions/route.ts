import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import {
  isStudentAssignedToProfessor,
  isTeacherUserId,
  repairConversationProfessor,
  repairInvalidConversationProfessors,
  resolveStudentProfessorId,
} from "@/lib/student-professor";

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

function normalizeSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasCareSignal(content: string): boolean {
  return classifyCareSignal(content).hasSignal;
}

type CareSignalClassification = {
  hasSignal: boolean;
  isCritical: boolean;
  requiresTrainingPause: boolean;
  eventType: "RELATO_DOR_DUVIDA" | "PAUSA_POR_CUIDADO";
  severity: "ALERTA" | "CUIDADO";
  status: "ABERTO" | "REQUER_REVISAO";
};

function classifyCareSignal(content: string): CareSignalClassification {
  const text = normalizeSearchText(content);
  const paddedText = ` ${text} `;

  const trainingPauseKeywords = [
    "nao consigo treinar",
    "nao consigo fazer treino",
    "nao consigo fazer o treino",
    "nao consigo me exercitar",
    "nao vou conseguir treinar",
    "nao posso treinar",
    "sem condicao de treinar",
    "sem condicoes de treinar",
    "sem condicao para treinar",
    "sem condicoes para treinar",
    "impossibilitado de treinar",
    "impossibilitada de treinar",
    "preciso parar de treinar",
    "vou ter que parar de treinar",
    "medico mandou parar",
    "medica mandou parar",
    "fisioterapeuta mandou parar",
    "estou de repouso",
    "repouso medico",
    "atestado",
    "fratura",
    "fraturei",
    "quebrei",
    "gesso",
    "imobilizado",
    "imobilizada",
    "bota ortopedica",
    "muleta",
    "cirurgia",
    "operei",
    "operacao",
    "hospital",
    "emergencia",
    "acidente",
    "cai e machuquei",
    "cai e nao consigo",
    "nao consigo apoiar",
    "nao consigo andar",
    "nao consigo levantar",
    "nao consigo mexer",
    "nao consigo mover",
  ];

  const requiresTrainingPause = trainingPauseKeywords.some((keyword) => text.includes(keyword));

  const generalCareKeywords = [
    "dor",
    "doendo",
    "dolorido",
    "dolorida",
    "desconforto",
    "machuquei",
    "machucou",
    "machucado",
    "machucada",
    "lesao",
    "lesionei",
    "torci",
    "torceu",
    "torsao",
    "torcao",
    "lombar",
    "coluna",
    "ciatico",
    "cervical",
    "ombro",
    "joelho",
    "tornozelo",
    "punho",
    "quadril",
    "panturrilha",
    "tontura",
    "tonto",
    "falta de ar",
    "formigamento",
    "fisgada",
    "travou",
    "inchado",
    "inchada",
    "inflamado",
    "inflamada",
  ];

  const hasShortFootSignal = /(^|\s)pe(\s|$)/.test(paddedText);
  const hasGeneralCareSignal =
    generalCareKeywords.some((keyword) => text.includes(keyword)) || hasShortFootSignal || requiresTrainingPause;

  if (!hasGeneralCareSignal) {
    return {
      hasSignal: false,
      isCritical: false,
      requiresTrainingPause: false,
      eventType: "RELATO_DOR_DUVIDA",
      severity: "ALERTA",
      status: "ABERTO",
    };
  }

  const criticalCareKeywords = [
    "dor forte",
    "dor intensa",
    "dor aguda",
    "dor insuportavel",
    "muita dor",
    "muito dolorido",
    "muito dolorida",
    "nao consigo",
    "torci",
    "torceu",
    "torsao",
    "torcao",
    "inchado",
    "inchada",
    "inchou",
    "inchei",
    "fisgada",
    "travou",
    "travei",
    "queda",
    "cai",
    "caiu",
    "machuquei",
    "lesionei",
    "lesao",
    "tontura",
    "tonto",
    "falta de ar",
    "formigamento",
    "desmaio",
    "desmaiei",
  ];

  const isCritical = requiresTrainingPause || criticalCareKeywords.some((keyword) => text.includes(keyword));

  return {
    hasSignal: true,
    isCritical,
    requiresTrainingPause,
    eventType: requiresTrainingPause ? "PAUSA_POR_CUIDADO" : "RELATO_DOR_DUVIDA",
    severity: isCritical ? "CUIDADO" : "ALERTA",
    status: isCritical ? "REQUER_REVISAO" : "ABERTO",
  };
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

type ConversationEmailRecipient = {
  id: string;
  name: string | null;
  email: string | null;
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
      .map((recipient) => {
        const recipientName = recipient.name || "usuário";
        const panelText =
          recipient.panelKind === "STUDENT"
            ? "seu painel do aluno"
            : recipient.panelKind === "TEACHER"
              ? "seu painel do professor"
              : "seu painel da gestão";

        const subject = "Nova mensagem no Funcional Vip Digital";

        const text = [
          `Olá, ${recipientName}!`,
          "",
          `Você recebeu uma nova mensagem de ${senderLabel} no Funcional Vip Digital.`,
          "",
          `Para visualizar, acesse ${panelText}.`,
          "",
          `Entrar no sistema: ${loginUrl}`,
        ].join("\n");

        const html = `
          <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
              <h2 style="color:#D4A373; margin:0 0 16px;">Nova mensagem</h2>

              <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
                Olá, ${escapeHtml(recipientName)}!
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Você recebeu uma nova mensagem de <strong style="color:#f5f5f5;">${safeSenderLabel}</strong> no Funcional Vip Digital.
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Para visualizar, acesse ${panelText}.
              </p>

              <a href="${loginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
                Acessar o sistema
              </a>

              <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
                Este é um aviso automático do Funcional Vip Digital.
              </p>
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
  } else if (senderRole === "TEACHER") {
    const teacher = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { id: true, name: true },
    });

    senderLabel = teacher?.name || "seu professor";

    if (studentId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true },
      });

      if (student) {
        recipients = [{ ...student, panelKind: "STUDENT" }];
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
        select: { id: true, name: true, email: true },
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

async function maybeCreateCareEventFromQuestion({
  rootConversationId,
  studentId,
  professorId,
  authorId,
}: {
  rootConversationId: string;
  studentId: string | null;
  professorId: string | null;
  authorId: string;
}) {
  if (!studentId) return;

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
    ? "Pausa por cuidado: aluno sem condição de treinar"
    : careClassification.isCritical
      ? "Relato crítico de dor/desconforto em dúvida do aluno"
      : "Relato de dor/desconforto em dúvida do aluno";
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
      await maybeCreateCareEventFromQuestion({
        rootConversationId,
        studentId,
        professorId: teacherId,
        authorId: userId,
      });
    } catch (careEventError) {
      console.error("Erro ao criar evento de cuidado a partir do chat/dúvidas:", careEventError);
    }

    if (!parentId) {
      try {
        await notifyNewConversationByEmail({
          senderRole,
          senderUserId: userId,
          studentId,
          teacherId,
        });
      } catch (emailError) {
        console.error("Erro ao enviar e-mail de nova conversa:", emailError);
      }
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
