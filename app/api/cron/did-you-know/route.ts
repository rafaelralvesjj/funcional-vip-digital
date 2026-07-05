import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type DidYouKnowContent = {
  id: string;
  title: string;
  content: string;
  category: string;
  active: boolean;
  priority: number;
};

type EligibleStudent = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  userAuthId: string | null;
  contractedTrainingDaysPerMonth: number | null;
};

function getAppStudentUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 16) return 3;

  return Math.ceil(contracted / 4);
}

function getWeekKey(referenceDate: Date): string {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const year = startOfWeek.getFullYear();
  const month = String(startOfWeek.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(startOfWeek.getDate()).padStart(2, "0");

  return `${year}-${month}-${dayOfMonth}`;
}

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

async function getNoticeAuthorId(): Promise<string | null> {
  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return gestor?.id || null;
}

async function chooseContentForStudent({
  studentId,
  activeContents,
}: {
  studentId: string;
  activeContents: DidYouKnowContent[];
}): Promise<DidYouKnowContent | null> {
  if (activeContents.length === 0) return null;

  const previousDeliveries = await prisma.didYouKnowDelivery.findMany({
    where: {
      studentId,
    },
    select: {
      contentId: true,
    },
    orderBy: {
      sentAt: "desc",
    },
  });

  const alreadyDeliveredContentIds = new Set(
    previousDeliveries.map((delivery) => delivery.contentId)
  );

  let availableContents = activeContents.filter(
    (content) => !alreadyDeliveredContentIds.has(content.id)
  );

  /*
   * Quando o aluno já recebeu todos os conteúdos ativos,
   * o ciclo recomeça. A trava semanal continua evitando repetição na mesma semana.
   */
  if (availableContents.length === 0) {
    availableContents = activeContents;
  }

  const lowestPriority = Math.min(...availableContents.map((content) => content.priority || 0));
  const priorityGroup = availableContents.filter(
    (content) => (content.priority || 0) === lowestPriority
  );

  return getRandomItem(priorityGroup);
}

function buildNoticeContent(content: DidYouKnowContent): string {
  return [
    content.content,
    "",
    "Esse conteúdo faz parte do acompanhamento educativo da Funcional Vip Digital.",
    "Se tiver dúvida sobre como aplicar isso na sua rotina, fale com seu professor pelo sistema.",
  ].join("\n");
}

async function sendDidYouKnowEmail({
  student,
  content,
}: {
  student: EligibleStudent;
  content: DidYouKnowContent;
}) {
  if (!student.email) return { sent: false, error: null };

  const studentUrl = getAppStudentUrl();
  const subject = `Você sabia? ${content.title.replace(/^Você sabia que\s*/i, "")}`;

  const text = [
    `Olá, ${student.name}.`,
    "",
    content.title,
    "",
    content.content,
    "",
    "Esse conteúdo faz parte do acompanhamento educativo da Funcional Vip Digital.",
    "Se tiver dúvida sobre como aplicar isso na sua rotina, fale com seu professor pelo sistema.",
    "",
    `Acesse sua área do aluno: ${studentUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:640px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <p style="color:#a1a1a1; font-size:13px; margin:0 0 8px;">Conteúdo educativo da semana</p>
        <h2 style="color:#D4A373; margin:0 0 16px; font-size:22px; line-height:1.3;">${escapeHtml(content.title)}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${escapeHtml(student.name || "Aluno")}</strong>.
        </p>

        <p style="color:#d4d4d4; font-size:15px; line-height:1.6; white-space:pre-line;">
          ${escapeHtml(content.content)}
        </p>

        <div style="background:#D4A37314; border:1px solid #D4A37333; border-radius:12px; padding:14px; margin-top:18px;">
          <p style="color:#D4A373; font-size:13px; line-height:1.5; margin:0;">
            Se tiver dúvida sobre como aplicar isso na sua rotina, fale com seu professor pelo sistema.
          </p>
        </div>

        <a href="${studentUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:20px;">
          Acessar área do aluno
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:20px; line-height:1.5;">
          Informação educativa geral. Para orientação alimentar individual, procure um nutricionista.
        </p>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: student.email,
      subject,
      text,
      html,
    });

    return { sent: true, error: null };
  } catch (error: any) {
    return { sent: false, error: error?.message || "Erro ao enviar e-mail" };
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorId = await getNoticeAuthorId();

  if (!authorId) {
    return NextResponse.json(
      { error: "Nenhum gestor/admin encontrado para assinar os avisos." },
      { status: 400 }
    );
  }

  const weekKey = getWeekKey(new Date());

  const activeContents = await prisma.didYouKnowContent.findMany({
    where: {
      active: true,
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  });

  if (activeContents.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nenhum conteúdo ativo encontrado.",
      weekKey,
      sent: [],
    });
  }

  const students = await prisma.student.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      userAuthId: true,
      contractedTrainingDaysPerMonth: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const eligibleStudents = students.filter((student) => {
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    return Boolean(student.userId) && Boolean(student.userAuthId) && Boolean(weeklyLimit);
  }) as EligibleStudent[];

  const sent: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const student of eligibleStudents) {
    try {
      const alreadySentThisWeek = await prisma.didYouKnowDelivery.findUnique({
        where: {
          studentId_weekKey: {
            studentId: student.id,
            weekKey,
          },
        },
        select: {
          id: true,
        },
      });

      if (alreadySentThisWeek) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: "Aluno já recebeu Você sabia nesta semana",
        });
        continue;
      }

      const content = await chooseContentForStudent({
        studentId: student.id,
        activeContents,
      });

      if (!content) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: "Nenhum conteúdo ativo disponível",
        });
        continue;
      }

      const notice = await prisma.notice.create({
        data: {
          title: content.title,
          content: buildNoticeContent(content),
          type: "VOCE_SABIA",
          targetRole: "ALUNO",
          studentId: student.id,
          authorId,
        },
      });

      const emailResult = await sendDidYouKnowEmail({
        student,
        content,
      });

      await prisma.didYouKnowDelivery.create({
        data: {
          studentId: student.id,
          contentId: content.id,
          noticeId: notice.id,
          weekKey,
          channel: emailResult.sent ? "AVISO_EMAIL" : "AVISO",
        },
      });

      sent.push({
        studentId: student.id,
        studentName: student.name,
        contentId: content.id,
        contentTitle: content.title,
        noticeId: notice.id,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
      });
    } catch (error: any) {
      errors.push({
        studentId: student.id,
        studentName: student.name,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    weekKey,
    totals: {
      activeContents: activeContents.length,
      eligibleStudents: eligibleStudents.length,
      sent: sent.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    sent,
    skipped,
    errors,
  });
}
