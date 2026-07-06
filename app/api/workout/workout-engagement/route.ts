import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type StudentForEngagement = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  userAuth?: {
    email: string | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type WorkoutForEngagement = {
  id: string;
  studentId: string;
  workoutPlanId: string | null;
  date: Date;
  status: string;
  student: StudentForEngagement;
  workoutPlan?: {
    id: string;
    name: string;
  } | null;
};

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

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

function getTodayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
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

function getStudentEmail(student: StudentForEngagement): string | null {
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

async function createNotice({
  title,
  content,
  type = "ENGAJAMENTO_TREINO",
  targetRole,
  authorId,
  studentId,
  professorId,
  expiresAt,
}: {
  title: string;
  content: string;
  type?: string;
  targetRole: string;
  authorId: string;
  studentId?: string | null;
  professorId?: string | null;
  expiresAt?: Date | null;
}) {
  return prisma.notice.create({
    data: {
      title,
      content,
      type,
      targetRole,
      authorId,
      studentId: studentId || null,
      professorId: professorId || null,
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

async function sendProfessorEmail({
  to,
  professorName,
  subject,
  title,
  content,
}: {
  to: string | null;
  professorName: string;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const dashboardUrl = getAppDashboardUrl();
  const safeProfessorName = escapeHtml(professorName);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Olá, ${professorName}.`,
    "",
    content,
    "",
    `Acesse o dashboard: ${dashboardUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:620px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${safeTitle}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${safeProfessorName}</strong>.
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${safeContent}
        </p>

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
    to,
    subject,
    text,
    html,
  });

  return true;
}

async function notifyTodayWorkout({
  workout,
  authorId,
}: {
  workout: WorkoutForEngagement;
  authorId: string;
}) {
  const eventType = "WORKOUT_DAY_REMINDER";
  const eventKey = workout.id;

  if (await alreadySent({ studentId: workout.studentId, eventType, eventKey })) {
    return { sent: false, reason: "Já enviado" };
  }

  const workoutName = workout.workoutPlan?.name || "seu treino";
  const title = "Hoje é dia de treino 💪";
  const content = [
    `Seu treino de hoje já está disponível: ${workoutName}.`,
    "",
    "Separe um momento do dia para cuidar de você e seguir firme no seu objetivo.",
    "Cada treino concluído conta para a sua evolução.",
  ].join("\n");

  const notice = await createNotice({
    title,
    content,
    targetRole: "ALUNO",
    authorId,
    studentId: workout.studentId,
    expiresAt: addDays(1),
  });

  await registerSent({
    studentId: workout.studentId,
    workoutId: workout.id,
    noticeId: notice.id,
    eventType,
    eventKey,
    channel: "AVISO",
  });

  return { sent: true };
}

async function notifyMissedWorkoutLevel({
  student,
  missedWorkouts,
  level,
  authorId,
}: {
  student: StudentForEngagement;
  missedWorkouts: WorkoutForEngagement[];
  level: 1 | 2 | 3;
  authorId: string;
}) {
  const latestMissedWorkout = missedWorkouts
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  if (!latestMissedWorkout) {
    return { sent: false, reason: "Sem treino perdido" };
  }

  const eventType = `MISSED_WORKOUT_${level}`;
  const eventKey = latestMissedWorkout.id;

  if (await alreadySent({ studentId: student.id, eventType, eventKey })) {
    return { sent: false, reason: "Já enviado" };
  }

  const studentName = student.name || "Aluno";
  const missedCount = missedWorkouts.length;

  const title =
    level === 1
      ? "Vamos retomar o ritmo?"
      : level === 2
        ? "Como podemos ajudar você a treinar?"
        : "Estamos aqui para ajudar você a voltar para o foco";

  const content =
    level === 1
      ? [
          "Percebemos que você não conseguiu concluir seu último treino.",
          "",
          "Tudo bem, rotina nem sempre é perfeita. O importante é retomar.",
          "Seu próximo treino continua disponível e estamos aqui para te ajudar a manter constância.",
        ].join("\n")
      : level === 2
        ? [
            "Percebemos que você deixou de concluir alguns treinos.",
            "",
            "Queremos te ajudar a não perder o ritmo. Se ficou alguma dúvida sobre o treino, carga, exercício ou organização da rotina, fale com seu professor pelo sistema.",
            "",
            "Estamos aqui para te apoiar no seu objetivo.",
          ].join("\n")
        : [
            "Estamos acompanhando sua evolução e percebemos que você ainda não conseguiu manter a sequência dos treinos.",
            "",
            "Seu resultado depende da constância, mas você não precisa fazer isso sozinho.",
            "Fale com seu professor pelo sistema para ajustar o treino, tirar dúvidas ou reorganizar sua rotina.",
            "",
            "Nosso foco é te ajudar a conquistar seu objetivo.",
          ].join("\n");

  const studentNotice = await createNotice({
    title,
    content,
    targetRole: "ALUNO",
    authorId,
    studentId: student.id,
    expiresAt: addDays(level === 1 ? 7 : 15),
  });

  let studentEmailSent = false;

  try {
    studentEmailSent = await sendStudentEmail({
      to: getStudentEmail(student),
      studentName,
      subject: title,
      title,
      content,
    });
  } catch (error) {
    console.error("Erro ao enviar e-mail para aluno com treino perdido:", error);
  }

  let professorNoticeCreated = false;
  let professorEmailSent = false;
  let gestaoNoticeCreated = false;

  if (level >= 2 && student.user?.id) {
    const professorTitle =
      level === 2
        ? "Aluno com baixa adesão ao treino"
        : "Aluno em risco de abandono de treino";

    const professorContent =
      level === 2
        ? [
            `O aluno ${studentName} deixou de concluir ${missedCount} treino(s).`,
            "",
            "Sugestão: avaliar se existe dúvida, dificuldade de execução, rotina incompatível ou necessidade de ajuste do treino.",
          ].join("\n")
        : [
            `O aluno ${studentName} já acumula ${missedCount} treino(s) não realizado(s).`,
            "",
            "Este é um sinal importante de risco de abandono. Recomendamos contato ativo, escuta das dificuldades e possível ajuste da programação.",
          ].join("\n");

    await createNotice({
      title: professorTitle,
      content: professorContent,
      targetRole: "PROFESSOR",
      authorId,
      professorId: student.user.id,
      expiresAt: addDays(15),
    });

    professorNoticeCreated = true;

    if (level >= 3) {
      try {
        professorEmailSent = await sendProfessorEmail({
          to: student.user.email,
          professorName: student.user.name || "Professor",
          subject: professorTitle,
          title: professorTitle,
          content: professorContent,
        });
      } catch (error) {
        console.error("Erro ao enviar e-mail para professor:", error);
      }
    }
  }

  if (level >= 3) {
    const gestaoTitle = "Aluno com risco de abandono de treino";
    const gestaoContent = [
      `O aluno ${studentName} acumula ${missedCount} treino(s) não realizado(s).`,
      "",
      student.user?.name
        ? `Professor responsável: ${student.user.name}.`
        : "Professor responsável não identificado.",
      "",
      "Sugestão: acompanhar a atuação do professor e avaliar se o aluno precisa de contato adicional.",
    ].join("\n");

    await createNotice({
      title: gestaoTitle,
      content: gestaoContent,
      targetRole: "GESTOR",
      authorId,
      expiresAt: addDays(15),
    });

    gestaoNoticeCreated = true;
  }

  await registerSent({
    studentId: student.id,
    workoutId: latestMissedWorkout.id,
    noticeId: studentNotice.id,
    eventType,
    eventKey,
    channel: studentEmailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    sent: true,
    level,
    studentEmailSent,
    professorNoticeCreated,
    professorEmailSent,
    gestaoNoticeCreated,
  };
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

  const { start: todayStart, end: todayEnd } = getTodayRange();
  const lookbackStart = new Date(todayStart);
  lookbackStart.setDate(todayStart.getDate() - 45);

  const todayWorkouts = (await prisma.workout.findMany({
    where: {
      date: {
        gte: todayStart,
        lt: todayEnd,
      },
      status: {
        not: "CONCLUIDO",
      },
      student: {
        active: true,
      },
    },
    include: {
      workoutPlan: {
        select: {
          id: true,
          name: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userId: true,
          userAuth: {
            select: {
              email: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  })) as WorkoutForEngagement[];

  const missedWorkouts = (await prisma.workout.findMany({
    where: {
      date: {
        gte: lookbackStart,
        lt: todayStart,
      },
      status: {
        not: "CONCLUIDO",
      },
      student: {
        active: true,
      },
    },
    include: {
      workoutPlan: {
        select: {
          id: true,
          name: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userId: true,
          userAuth: {
            select: {
              email: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  })) as WorkoutForEngagement[];

  const reminderResults: any[] = [];
  const missedResults: any[] = [];
  const errors: any[] = [];

  for (const workout of todayWorkouts) {
    try {
      const result = await notifyTodayWorkout({
        workout,
        authorId,
      });

      reminderResults.push({
        workoutId: workout.id,
        studentId: workout.studentId,
        studentName: workout.student.name,
        ...result,
      });
    } catch (error: any) {
      errors.push({
        type: "TODAY_REMINDER",
        workoutId: workout.id,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  const missedByStudent = new Map<string, WorkoutForEngagement[]>();

  for (const workout of missedWorkouts) {
    if (!missedByStudent.has(workout.studentId)) {
      missedByStudent.set(workout.studentId, []);
    }

    missedByStudent.get(workout.studentId)!.push(workout);
  }

  for (const [studentId, workouts] of Array.from(missedByStudent.entries())) {
    try {
      const student = workouts[0].student;
      const missedCount = workouts.length;
      const level: 1 | 2 | 3 = missedCount >= 3 ? 3 : missedCount === 2 ? 2 : 1;

      const result = await notifyMissedWorkoutLevel({
        student,
        missedWorkouts: workouts,
        level,
        authorId,
      });

      missedResults.push({
        studentId,
        studentName: student.name,
        missedCount,
        level,
        ...result,
      });
    } catch (error: any) {
      errors.push({
        type: "MISSED_WORKOUT",
        studentId,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    today: {
      start: todayStart.toISOString(),
      end: todayEnd.toISOString(),
      display: formatDatePtBr(todayStart),
    },
    totals: {
      todayWorkouts: todayWorkouts.length,
      remindersSent: reminderResults.filter((item) => item.sent).length,
      studentsWithMissedWorkouts: missedByStudent.size,
      missedNotificationsSent: missedResults.filter((item) => item.sent).length,
      errors: errors.length,
    },
    reminders: reminderResults,
    missed: missedResults,
    errors,
  });
}
