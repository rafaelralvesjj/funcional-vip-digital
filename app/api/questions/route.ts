import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
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
      const myStudents = await prisma.student.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
        },
      });

      const myStudentIds = myStudents.map((student) => student.id);

      where.OR = [
        {
          teacherId: userId,
        },
        {
          studentId: {
            in: myStudentIds,
          },
        },
      ];
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
    const body = await req.json().catch(() => ({}));

    const content = cleanText(body.content);
    const requestedParentId = cleanId(body.parentId);
    const requestedStudentId = cleanId(body.studentId);
    const requestedTeacherId = cleanId(body.teacherId);
    const videoUrl = cleanId(body.videoUrl);
    const imageUrl = cleanId(body.imageUrl);
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
      studentId = studentId || rootQuestion.studentId || null;
      teacherId = teacherId || rootQuestion.teacherId || null;
    }

    /*
     * Regras:
     * - aluno pode enviar para professor: studentId + teacherId.
     * - aluno pode enviar para gestão: studentId sem teacherId.
     * - gestor pode enviar/responder para aluno ou professor.
     * - professor responde conversas em que ele é o teacherId.
     */
    if (!studentId && !teacherId) {
      return NextResponse.json(
        { error: "Selecione um aluno ou professor para a conversa" },
        { status: 400 }
      );
    }

    if (studentId) {
      const student = await validateStudent(studentId);

      if (!student) {
        return NextResponse.json(
          { error: "Aluno não encontrado" },
          { status: 404 }
        );
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
        { error: "Você não tem permissão para responder esta conversa" },
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
