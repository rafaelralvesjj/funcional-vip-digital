import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type PendingStudent = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  contractedTrainingDaysPerMonth: number | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type ProfessorPendingGroup = {
  professor: {
    id: string;
    name: string | null;
    email: string | null;
  };
  students: Array<{
    id: string;
    name: string;
    weeklyLimit: number;
    createdCount: number;
    missingCount: number;
  }>;
};

function getAppDashboardUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard`;
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

function getNextWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const currentWeek = getWeekRange(referenceDate);

  const startOfWeek = new Date(currentWeek.startOfWeek);
  startOfWeek.setDate(currentWeek.startOfWeek.getDate() + 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function buildNoticeContent({
  professorName,
  students,
  weekLabel,
}: {
  professorName: string;
  students: ProfessorPendingGroup["students"];
  weekLabel: string;
}): string {
  const studentLines = students
    .map((student) => {
      return `- ${student.name}: ${student.createdCount}/${student.weeklyLimit} treino(s) criado(s). Falta(m) ${student.missingCount}.`;
    })
    .join("\n");

  return [
    `Olá, ${professorName}.`,
    "",
    "Hoje é o prazo de sábado para deixar os treinos da próxima semana preparados.",
    `Semana alvo: ${weekLabel}.`,
    "",
    "Os alunos abaixo ainda estão sem a quantidade completa de treinos:",
    studentLines,
    "",
    "Acesse o dashboard e finalize a montagem dos treinos pendentes.",
  ].join("\n");
}

async function notifyProfessorDeadline({
  group,
  authorId,
  weekLabel,
}: {
  group: ProfessorPendingGroup;
  authorId: string | null;
  weekLabel: string;
}) {
  const dashboardUrl = getAppDashboardUrl();
  const professorName = group.professor.name || "Professor";
  const professorEmail = group.professor.email;

  const title = `Prazo vence hoje: treinos pendentes da próxima semana`;
  const content = buildNoticeContent({
    professorName,
    students: group.students,
    weekLabel,
  });

  /*
   * O aviso é usado também como trava contra duplicidade.
   * Se já existe aviso para este professor e esta semana alvo, não envia e-mail de novo.
   */
  const existingNotice = await prisma.notice.findFirst({
    where: {
      professorId: group.professor.id,
      targetRole: "PROFESSOR",
      type: "MANAGEMENT",
      title,
      content: {
        contains: weekLabel,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingNotice) {
    return {
      professorId: group.professor.id,
      professorName,
      emailSent: false,
      noticeCreated: false,
      skipped: true,
      reason: "Aviso de prazo já enviado para este professor nesta semana alvo",
    };
  }

  if (authorId) {
    await prisma.notice.create({
      data: {
        title,
        content,
        type: "MANAGEMENT",
        targetRole: "PROFESSOR",
        professorId: group.professor.id,
        authorId,
      },
    });
  }

  if (professorEmail) {
    const safeProfessorName = escapeHtml(professorName);
    const safeWeekLabel = escapeHtml(weekLabel);

    const studentItemsHtml = group.students
      .map((student) => {
        return `
          <li style="margin-bottom:8px; color:#d4d4d4; font-size:14px; line-height:1.5;">
            <strong style="color:#f5f5f5;">${escapeHtml(student.name)}</strong>:
            ${student.createdCount}/${student.weeklyLimit} treino(s) criado(s).
            <span style="color:#f87171;">Falta(m) ${student.missingCount}.</span>
          </li>
        `;
      })
      .join("");

    const text = [
      `Olá, ${professorName}.`,
      "",
      "Hoje é o prazo de sábado para deixar os treinos da próxima semana preparados.",
      `Semana alvo: ${weekLabel}.`,
      "",
      "Alunos pendentes:",
      ...group.students.map((student) => {
        return `- ${student.name}: ${student.createdCount}/${student.weeklyLimit}. Falta(m) ${student.missingCount}.`;
      }),
      "",
      `Acesse o dashboard: ${dashboardUrl}`,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#D4A373; margin:0 0 16px;">Prazo vence hoje</h2>

          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
            Olá, <strong>${safeProfessorName}</strong>.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Hoje é o prazo de sábado para deixar os treinos da próxima semana preparados.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Semana alvo: <strong style="color:#f5f5f5;">${safeWeekLabel}</strong>.
          </p>

          <p style="color:#f5f5f5; font-size:14px; line-height:1.5; margin-top:18px;">
            Alunos ainda pendentes:
          </p>

          <ul style="padding-left:20px; margin-top:8px;">
            ${studentItemsHtml}
          </ul>

          <a href="${dashboardUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
            Acessar dashboard
          </a>

          <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
            Este é um aviso automático do Funcional Vip Digital.
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: professorEmail,
      subject: title,
      text,
      html,
    });
  }

  return {
    professorId: group.professor.id,
    professorName,
    emailSent: Boolean(professorEmail),
    noticeCreated: Boolean(authorId),
    skipped: false,
    reason: null,
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextWeek = getNextWeekRange(new Date());
  const weekEndDisplay = new Date(nextWeek.endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(nextWeek.startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const authorId = await getNoticeAuthorId();

  const allActiveStudents = await prisma.student.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      contractedTrainingDaysPerMonth: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const eligibleStudents = allActiveStudents.filter((student) => {
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    return Boolean(student.userId) && Boolean(student.user) && Boolean(weeklyLimit);
  }) as PendingStudent[];

  const groupsByProfessor = new Map<string, ProfessorPendingGroup>();

  for (const student of eligibleStudents) {
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    if (!weeklyLimit || !student.user) {
      continue;
    }

    const createdCount = await prisma.workoutPlan.count({
      where: {
        studentId: student.id,
        date: {
          gte: nextWeek.startOfWeek,
          lt: nextWeek.endOfWeek,
        },
      },
    });

    if (createdCount >= weeklyLimit) {
      continue;
    }

    const missingCount = weeklyLimit - createdCount;
    const professor = student.user;

    if (!groupsByProfessor.has(professor.id)) {
      groupsByProfessor.set(professor.id, {
        professor,
        students: [],
      });
    }

    groupsByProfessor.get(professor.id)!.students.push({
      id: student.id,
      name: student.name || "Aluno",
      weeklyLimit,
      createdCount,
      missingCount,
    });
  }

  const professorGroups = Array.from(groupsByProfessor.values());

  const notified: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const group of professorGroups) {
    try {
      const result = await notifyProfessorDeadline({
        group,
        authorId,
        weekLabel,
      });

      if (result.skipped) {
        skipped.push(result);
      } else {
        notified.push({
          ...result,
          pendingStudents: group.students.length,
        });
      }
    } catch (error: any) {
      errors.push({
        professorId: group.professor.id,
        professorName: group.professor.name,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    weekTarget: {
      start: nextWeek.startOfWeek.toISOString(),
      end: nextWeek.endOfWeek.toISOString(),
      label: weekLabel,
    },
    totals: {
      eligibleStudents: eligibleStudents.length,
      professorsWithPendingStudents: professorGroups.length,
      notified: notified.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    notified,
    skipped,
    errors,
  });
}
