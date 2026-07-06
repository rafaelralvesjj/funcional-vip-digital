import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function getAppAlunoUrl(): string {
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

function isDateInCurrentValidationWeek(date: Date): boolean {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);

  const currentWeek = getWeekRange(new Date());

  return normalized >= currentWeek.startOfWeek && normalized < currentWeek.endOfWeek;
}

function getCurrentValidationDeadlineLabel(): string {
  const currentWeek = getWeekRange(new Date());
  const deadline = new Date(currentWeek.endOfWeek);
  deadline.setDate(deadline.getDate() - 1);

  return formatDatePtBr(deadline);
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

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function normalizeDateFromBody(value: unknown, fallback?: Date | null): Date {
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`);
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (fallback && !Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return new Date();
}

async function getNoticeAuthorId(studentProfessorId?: string | null): Promise<string | null> {
  if (studentProfessorId) return studentProfessorId;

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

async function getStudentEmail(student: {
  email?: string | null;
  userAuth?: { email?: string | null } | null;
}): Promise<string | null> {
  return student.email || student.userAuth?.email || null;
}

async function alreadySent({
  studentId,
  eventType,
  eventKey,
}: {
  studentId: string;
  eventType: string;
  eventKey: string;
}): Promise<boolean> {
  const existing = await prisma.workoutEngagementNotification.findFirst({
    where: {
      studentId,
      eventType,
      eventKey,
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

async function registerSent({
  studentId,
  workoutId,
  noticeId,
  eventType,
  eventKey,
  channel,
}: {
  studentId: string;
  workoutId?: string | null;
  noticeId?: string | null;
  eventType: string;
  eventKey: string;
  channel: string;
}) {
  try {
    await prisma.workoutEngagementNotification.create({
      data: {
        studentId,
        workoutId: workoutId || null,
        noticeId: noticeId || null,
        eventType,
        eventKey,
        channel,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") {
      throw error;
    }
  }
}

async function createStudentNotice({
  studentId,
  authorId,
  title,
  content,
  type = "ENGAJAMENTO_TREINO",
  expiresAt,
}: {
  studentId: string;
  authorId: string;
  title: string;
  content: string;
  type?: string;
  expiresAt?: Date | null;
}) {
  return prisma.notice.create({
    data: {
      title,
      content,
      type,
      targetRole: "ALUNO",
      studentId,
      authorId,
      expiresAt: expiresAt || null,
    },
    select: {
      id: true,
    },
  });
}

async function sendStudentEmail({
  to,
  studentName,
  subject,
  title,
  content,
}: {
  to: string | null;
  studentName: string;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Olá, ${studentName}!`,
    "",
    content,
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${safeTitle}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${safeStudentName}</strong>!
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${safeContent}
        </p>

        <a href="${alunoUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Acessar minha área
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
          Este é um aviso automático do Funcional Vip Digital.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    text,
    html,
  });

  return true;
}

async function notifyWorkoutCompleted({
  student,
  workout,
  authorId,
  completedCountAfter,
}: {
  student: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
    contractedTrainingDaysPerMonth: number | null;
    userAuth?: { email?: string | null } | null;
  };
  workout: {
    id: string;
    date: Date;
    workoutPlanId: string | null;
    contractId?: string | null;
  };
  authorId: string;
  completedCountAfter: number;
}) {
  const studentName = student.name || "Aluno";
  const studentEmail = await getStudentEmail(student);

  const isFirstCompletedWorkout = completedCountAfter === 1;
  const eventType = isFirstCompletedWorkout
    ? "FIRST_WORKOUT_COMPLETED"
    : "WORKOUT_COMPLETED";

  const eventKey = isFirstCompletedWorkout ? "FIRST" : workout.id;

  if (await alreadySent({ studentId: student.id, eventType, eventKey })) {
    return {
      eventType,
      sent: false,
      reason: "Já enviado",
    };
  }

  const title = isFirstCompletedWorkout
    ? "Primeiro treino concluído! 👏"
    : "Treino concluído! 👏";

  const content = isFirstCompletedWorkout
    ? [
        "Parabéns por concluir seu primeiro treino no Funcional Vip Digital!",
        "",
        "Esse é um marco importante da sua jornada. A constância é o que transforma treino em evolução.",
        "",
        "Continue registrando seus treinos para que seu professor consiga acompanhar seu progresso com mais precisão.",
      ].join("\n")
    : [
        "Parabéns, treino concluído!",
        "",
        "Você deu mais um passo importante no seu objetivo. Cada treino registrado ajuda seu acompanhamento e fortalece sua evolução.",
      ].join("\n");

  const notice = await createStudentNotice({
    studentId: student.id,
    authorId,
    title,
    content,
    expiresAt: addDays(30),
  });

  let emailSent = false;

  if (isFirstCompletedWorkout) {
    try {
      emailSent = await sendStudentEmail({
        to: studentEmail,
        studentName,
        subject: title,
        title,
        content,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de primeiro treino concluído:", error);
    }
  }

  await registerSent({
    studentId: student.id,
    workoutId: workout.id,
    noticeId: notice.id,
    eventType,
    eventKey,
    channel: isFirstCompletedWorkout && emailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    eventType,
    sent: true,
    emailSent,
  };
}

async function notifyWeekCompletedIfNeeded({
  student,
  workoutDate,
  workoutId,
  authorId,
}: {
  student: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
    contractedTrainingDaysPerMonth: number | null;
    userAuth?: { email?: string | null } | null;
  };
  workoutDate: Date;
  workoutId: string;
  authorId: string;
}) {
  const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

  if (!weeklyLimit) {
    return {
      sent: false,
      reason: "Aluno sem meta semanal configurada",
    };
  }

  const { startOfWeek, endOfWeek } = getWeekRange(workoutDate);
  const weekKey = startOfWeek.toISOString().slice(0, 10);

  if (await alreadySent({ studentId: student.id, eventType: "WEEK_100_COMPLETED", eventKey: weekKey })) {
    return {
      sent: false,
      reason: "Semana já reconhecida",
    };
  }

  const plannedCount = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...(workoutId ? {} : {}),
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  const workoutForContract = await prisma.workout.findUnique({
    where: {
      id: workoutId,
    },
    select: {
      contractId: true,
    },
  });

  const contractFilter = workoutForContract?.contractId
    ? {
        contractId: workoutForContract.contractId,
      }
    : {};

  const plannedCountInCycle = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...contractFilter,
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  const completedCount = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...contractFilter,
      status: "CONCLUIDO",
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  if (plannedCountInCycle < weeklyLimit || completedCount < weeklyLimit) {
    return {
      sent: false,
      reason: `Semana ainda não completa: ${completedCount}/${weeklyLimit}`,
    };
  }

  const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const title = "Semana concluída com sucesso! 🔥";
  const content = [
    "Parabéns! Você concluiu todos os treinos previstos para esta semana.",
    "",
    `Semana de referência: ${weekLabel}.`,
    "",
    "Esse nível de constância faz diferença no seu resultado. Continue registrando seus treinos e mantendo sua rotina ativa.",
  ].join("\n");

  const notice = await createStudentNotice({
    studentId: student.id,
    authorId,
    title,
    content,
    expiresAt: addDays(30),
  });

  let emailSent = false;

  try {
    emailSent = await sendStudentEmail({
      to: await getStudentEmail(student),
      studentName: student.name || "Aluno",
      subject: title,
      title,
      content,
    });
  } catch (error) {
    console.error("Erro ao enviar e-mail de semana concluída:", error);
  }

  await registerSent({
    studentId: student.id,
    workoutId,
    noticeId: notice.id,
    eventType: "WEEK_100_COMPLETED",
    eventKey: weekKey,
    channel: emailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    sent: true,
    emailSent,
    completedCount,
    weeklyLimit,
  };
}

async function canAccessStudent({
  userId,
  userEmail,
  role,
  student,
}: {
  userId: string | null;
  userEmail: string | null;
  role: string;
  student: {
    userId: string | null;
    userAuthId: string | null;
    email: string | null;
  };
}) {
  if (!userId) return false;

  if (role === "GESTOR" || role === "ADMIN") return true;
  if (role === "TEACHER") return student.userId === userId;
  if (role === "STUDENT") {
    return student.userAuthId === userId || Boolean(userEmail && student.email === userEmail);
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.email ? String(sessionUser.email) : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));

    if (!studentId) {
      return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        userId: true,
        userAuthId: true,
        email: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      userEmail,
      role,
      student,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const referenceMonth = Number.isFinite(month) && month >= 1 && month <= 12
      ? month
      : new Date().getMonth() + 1;
    const referenceYear = Number.isFinite(year) && year > 2000
      ? year
      : new Date().getFullYear();

    const start = new Date(referenceYear, referenceMonth - 1, 1);
    const end = new Date(referenceYear, referenceMonth, 1);

    const workouts = await prisma.workout.findMany({
      where: {
        studentId,
        date: {
          gte: start,
          lt: end,
        },
      },
      include: {
        workoutPlan: {
          select: {
            id: true,
            name: true,
            description: true,
            notes: true,
            date: true,
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json(workouts);
  } catch (error: any) {
    console.error("GET /api/workout/mark-complete error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.email ? String(sessionUser.email) : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const studentId = typeof body?.studentId === "string" ? body.studentId : null;
    const workoutPlanId = typeof body?.workoutPlanId === "string" ? body.workoutPlanId : null;

    if (!studentId || !workoutPlanId) {
      return NextResponse.json(
        { error: "studentId e workoutPlanId são obrigatórios" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        email: true,
        userId: true,
        userAuthId: true,
        contractedTrainingDaysPerMonth: true,
        userAuth: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      userEmail,
      role,
      student,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: workoutPlanId,
        studentId,
      },
      select: {
        id: true,
        date: true,
        name: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Treino não encontrado" }, { status: 404 });
    }

    /*
     * A data oficial para validação é a data planejada do treino.
     * O body.date fica apenas como fallback para treinos antigos sem data no plano.
     * Isso evita o aluno validar hoje um treino de outra semana e distorcer a adesão.
     */
    const workoutDate = normalizeDateFromBody(plan.date || body?.date, plan.date);

    if (!isDateInCurrentValidationWeek(workoutDate)) {
      return NextResponse.json(
        {
          error:
            `Prazo de validação encerrado. O treino só pode ser validado na própria semana, até domingo (${getCurrentValidationDeadlineLabel()}).`,
          code: "VALIDATION_WINDOW_CLOSED",
        },
        { status: 403 }
      );
    }

    const authorId = await getNoticeAuthorId(student.userId);

    if (!authorId) {
      return NextResponse.json(
        { error: "Nenhum autor encontrado para criar aviso" },
        { status: 400 }
      );
    }

    const existingWorkout = await prisma.workout.findFirst({
      where: {
        studentId,
        workoutPlanId,
      },
      select: {
        id: true,
        status: true,
        contractId: true,
      },
    });

    const workoutPlanForContract = await prisma.workoutPlan.findUnique({
      where: {
        id: workoutPlanId,
      },
      select: {
        contractId: true,
      },
    });

    const workout = existingWorkout
      ? await prisma.workout.update({
          where: { id: existingWorkout.id },
          data: {
            status: "CONCLUIDO",
            date: workoutDate,
            contractId: existingWorkout.contractId || workoutPlanForContract?.contractId || null,
          },
          select: {
            id: true,
            studentId: true,
            workoutPlanId: true,
            contractId: true,
            date: true,
            status: true,
          },
        })
      : await prisma.workout.create({
          data: {
            studentId,
            workoutPlanId,
            contractId: workoutPlanForContract?.contractId || null,
            date: workoutDate,
            status: "CONCLUIDO",
          },
          select: {
            id: true,
            studentId: true,
            workoutPlanId: true,
            contractId: true,
            date: true,
            status: true,
          },
        });

    const completedCountAfter = await prisma.workout.count({
      where: {
        studentId,
        status: "CONCLUIDO",
        ...(workout.contractId ? { contractId: workout.contractId } : {}),
      },
    });

    const completionNotification = await notifyWorkoutCompleted({
      student,
      workout,
      authorId,
      completedCountAfter,
    });

    const weekNotification = await notifyWeekCompletedIfNeeded({
      student,
      workoutDate,
      workoutId: workout.id,
      authorId,
    });

    return NextResponse.json({
      ok: true,
      workout,
      notifications: {
        completion: completionNotification,
        week: weekNotification,
      },
    });
  } catch (error: any) {
    console.error("POST /api/workout/mark-complete error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}
