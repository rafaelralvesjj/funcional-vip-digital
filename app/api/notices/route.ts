import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();

  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";

  return role;
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

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function getDefaultExpiresAt(type?: string | null, rawExpiresAt?: string | null): Date | null {
  if (rawExpiresAt) {
    const parsed = new Date(rawExpiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const normalizedType = String(type || "").toUpperCase();

  if (normalizedType === "FEEDBACK_EVOLUCAO") return null;
  if (normalizedType.includes("BIOIMPEDANCIA")) return null;
  if (normalizedType.includes("PENDENCIA")) return null;

  if (normalizedType === "VOCE_SABIA") return addDays(30);
  if (normalizedType === "WORKOUT") return addDays(7);
  if (normalizedType === "ENGAJAMENTO_TREINO") return addDays(15);

  /*
   * Aviso manual da gestão: por padrão expira em 30 dias.
   * Se a gestão quiser manter permanente, depois podemos adicionar opção "sem expiração" na tela.
   */
  return addDays(30);
}

type NoticeEmailRecipient = {
  id: string;
  name: string | null;
  email: string | null;
};

async function sendNoticeEmailToRecipients({
  recipients,
  title,
  recipientKind,
}: {
  recipients: NoticeEmailRecipient[];
  title: string;
  recipientKind: "STUDENT" | "TEACHER";
}) {
  const loginUrl = getAppLoginUrl();
  const safeTitle = escapeHtml(title);
  const subject = `Novo aviso da gestão: ${title}`;

  const panelText =
    recipientKind === "STUDENT"
      ? "seu painel do aluno"
      : "seu painel do professor";

  await Promise.allSettled(
    recipients
      .filter((recipient) => Boolean(recipient.email))
      .map((recipient) => {
        const recipientName =
          recipient.name || (recipientKind === "STUDENT" ? "aluno" : "professor");

        const text = [
          `Olá, ${recipientName}!`,
          "",
          "Você recebeu um novo aviso da gestão no Funcional Vip Digital.",
          "",
          `Título: ${title}`,
          "",
          `Para ler o aviso completo, acesse ${panelText}.`,
          "",
          `Entrar no sistema: ${loginUrl}`,
        ].join("\n");

        const html = `
          <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
              <h2 style="color:#D4A373; margin:0 0 16px;">Novo aviso da gestão</h2>

              <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
                Olá, ${escapeHtml(recipientName)}!
              </p>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Você recebeu um novo aviso da gestão no Funcional Vip Digital.
              </p>

              <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:16px; margin:20px 0;">
                <p style="color:#a1a1a1; font-size:12px; margin:0 0 6px;">Título do aviso</p>
                <p style="color:#f5f5f5; font-size:16px; font-weight:bold; margin:0;">${safeTitle}</p>
              </div>

              <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
                Para ler o aviso completo, acesse ${panelText}.
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

async function notifyNoticeByEmail(notice: {
  id: string;
  title: string | null;
  content: string;
  targetRole: string;
  studentId: string | null;
  professorId: string | null;
  student?: NoticeEmailRecipient | null;
  professor?: NoticeEmailRecipient | null;
}) {
  const targetRole = normalizeRole(notice.targetRole);
  const title = notice.title || "Novo aviso da gestão";

  if (targetRole === "TEACHER") {
    let recipients: NoticeEmailRecipient[] = [];

    if (notice.professorId && notice.professor) {
      recipients = [notice.professor];
    } else if (!notice.professorId) {
      recipients = await prisma.user.findMany({
        where: {
          role: {
            in: ["PROFESSOR", "TEACHER"],
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
    }

    await sendNoticeEmailToRecipients({
      recipients,
      title,
      recipientKind: "TEACHER",
    });

    return;
  }

  if (targetRole === "STUDENT") {
    let recipients: NoticeEmailRecipient[] = [];

    if (notice.studentId && notice.student) {
      recipients = [notice.student];
    } else if (!notice.studentId) {
      recipients = await prisma.student.findMany({
        where: {
          active: true,
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
    }

    await sendNoticeEmailToRecipients({
      recipients,
      title,
      recipientKind: "STUDENT",
    });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const studentId = searchParams.get("studentId");
    const authorId = searchParams.get("authorId");
    const targetRole = searchParams.get("targetRole");
    const professorId = searchParams.get("professorId");

    const now = new Date();

    const where: any = {
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: now } },
          ],
        },
      ],
    };

    if (authorId) {
      where.authorId = authorId;
    }

    if (targetRole) {
      where.targetRole = targetRole;
    }

    if (studentId) {
      const student = await prisma.student.findUnique({
        where: {
          id: studentId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (!student) {
        return NextResponse.json([]);
      }

      where.AND.push({
        OR: [
          {
            studentId,
          },
          {
            studentId: null,
            targetRole: "STUDENT",
            createdAt: {
              gte: student.createdAt,
            },
          },
          {
            studentId: null,
            targetRole: "ALUNO",
            createdAt: {
              gte: student.createdAt,
            },
          },
        ],
      });
    }

    if (professorId) {
      const professor = await prisma.user.findUnique({
        where: {
          id: professorId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (!professor) {
        return NextResponse.json([]);
      }

      where.AND.push({
        OR: [
          {
            professorId,
          },
          {
            professorId: null,
            targetRole: "TEACHER",
            createdAt: {
              gte: professor.createdAt,
            },
          },
          {
            professorId: null,
            targetRole: "PROFESSOR",
            createdAt: {
              gte: professor.createdAt,
            },
          },
        ],
      });
    }

    const notices = await prisma.notice.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reads: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error("GET /api/notices error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar avisos" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      title,
      content,
      type,
      studentId,
      authorId,
      targetRole,
      professorId,
      expiresAt,
    } = body;

    if (!content || !authorId) {
      return NextResponse.json(
        { error: "Conteúdo e autor são obrigatórios" },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.create({
      data: {
        title: typeof title === "string" && title.trim() ? title.trim() : null,
        content: String(content).trim(),
        type: type || "AVISO",
        authorId,
        studentId: studentId || null,
        targetRole: targetRole || "ALUNO",
        professorId: professorId || null,
        expiresAt: getDefaultExpiresAt(type || "AVISO", expiresAt || null),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reads: true,
      },
    });

    try {
      await notifyNoticeByEmail({
        id: notice.id,
        title: notice.title,
        content: notice.content,
        targetRole: notice.targetRole,
        studentId: notice.studentId,
        professorId: notice.professorId,
        student: notice.student,
        professor: notice.professor,
      });
    } catch (emailError) {
      console.error("Erro ao enviar e-mail do aviso:", emailError);
    }

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("POST /api/notices error:", error);
    return NextResponse.json(
      { error: "Erro ao criar aviso" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, title, content, expiresAt } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do aviso é obrigatório" },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.update({
      where: {
        id,
      },
      data: {
        title: typeof title === "string" && title.trim() ? title.trim() : null,
        content: typeof content === "string" ? content.trim() : content,
        ...(expiresAt !== undefined
          ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
          : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reads: true,
      },
    });

    return NextResponse.json(notice);
  } catch (error) {
    console.error("PUT /api/notices error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar aviso" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do aviso é obrigatório" },
        { status: 400 }
      );
    }

    await prisma.notice.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notices error:", error);
    return NextResponse.json(
      { error: "Erro ao excluir aviso" },
      { status: 500 }
    );
  }
}
