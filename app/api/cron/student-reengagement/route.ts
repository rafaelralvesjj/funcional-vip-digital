import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import {
  classifyStudentReengagement,
  daysBetween,
  ENGAGED_LOOKBACK_WINDOW_DAYS,
  QUIET_MIN_DAYS_SINCE_LAST_COMPLETED,
  REENGAGEMENT_COOLDOWN_DAYS,
  REENGAGEMENT_ELIGIBLE_COMMERCIAL_STATUSES,
  RECENT_OPERATIONAL_CONTACT_GUARD_DAYS,
  type StudentReengagementCategory,
} from "@/lib/student-reengagement";

export const maxDuration = 60;

type StudentForReengagement = {
  id: string;
  name: string;
  userAuth: { email: string | null; role: string | null } | null;
  contracts: { startDate: Date; activatedAt: Date | null }[];
};

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

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

function getStudentEmail(student: StudentForReengagement): string | null {
  const linkedRole = String(student.userAuth?.role || "").toUpperCase();

  if (linkedRole !== "ALUNO") {
    console.warn(
      `[student-reengagement] E-mail não enviado: cadastro ${student.id} não possui usuário ALUNO vinculado.`
    );
    return null;
  }

  return student.userAuth?.email?.trim() || null;
}

function buildReengagementEmail(
  category: StudentReengagementCategory,
  studentName: string
): { subject: string; text: string; html: string } {
  const alunoUrl = getAppAlunoUrl();

  const copyByCategory: Record<
    StudentReengagementCategory,
    { subject: string; title: string; body: string[] }
  > = {
    NUNCA_COMECOU: {
      subject: "Seu primeiro treino está te esperando 💪",
      title: "Seu primeiro treino está te esperando",
      body: [
        `Oi, ${studentName}! Vimos que você já faz parte do Funcional UP Digital, mas ainda não deu o primeiro passo nos treinos.`,
        "Sem pressão — o primeiro treino costuma ser o mais simples de todos, e a gente está aqui pra ajudar se alguma coisa não estiver clara.",
        "Que tal começar hoje? Qualquer dúvida, fale com seu professor pelo chat da plataforma.",
      ],
    },
    COMECOU_E_ABANDONOU: {
      subject: "Sentimos sua falta por aqui",
      title: "Sentimos sua falta por aqui",
      body: [
        `Oi, ${studentName}! Notamos que você chegou a começar os treinos, mas parou há um tempo.`,
        "Isso é bem mais comum do que parece, e não apaga nada do que você já fez.",
        "Se alguma coisa dificultou — tempo, dúvida, algum exercício específico — conta pra gente pelo chat, a gente ajusta o treino com você. Retomar não precisa ser difícil.",
      ],
    },
    ENGAJADO_MAS_CAIU: {
      subject: "Vamos retomar o ritmo que você tinha?",
      title: "Vamos retomar o ritmo que você tinha?",
      body: [
        `Oi, ${studentName}! Você vinha com uma frequência muito boa nos treinos, e sentimos sua falta nos últimos dias.`,
        "Se algo mudou na sua rotina, me conta pelo chat que a gente adapta os treinos pra encaixar melhor no seu momento.",
        "Seu progresso até aqui não se perdeu — só precisa de um empurrão pra continuar.",
      ],
    },
  };

  const copy = copyByCategory[category];

  const text = [
    ...copy.body,
    "",
    "Equipe Funcional UP Digital",
    "Mensagem automática de reengajamento.",
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <h1>${escapeHtml(copy.title)}</h1>
    ${copy.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
    <a href="${alunoUrl}">Acessar minha área</a>
    <p style="color:#6b6b6b;font-size:11px;">Mensagem automática de reengajamento enviada pela equipe Funcional UP Digital.</p>
  `;

  return { subject: copy.subject, text, html };
}

async function resolveEligibleStudents(): Promise<StudentForReengagement[]> {
  return prisma.student.findMany({
    where: {
      active: true,
      commercialStatus: { in: REENGAGEMENT_ELIGIBLE_COMMERCIAL_STATUSES },
    },
    select: {
      id: true,
      name: true,
      userAuth: { select: { email: true, role: true } },
      contracts: {
        where: { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { startDate: true, activatedAt: true },
      },
    },
  });
}

async function hasRecentCooldownEmail(
  studentId: string,
  category: StudentReengagementCategory,
  now: Date
): Promise<boolean> {
  const lastSent = await prisma.studentReengagementEmail.findFirst({
    where: { studentId, category },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });

  if (!lastSent) return false;

  return daysBetween(lastSent.sentAt, now) < REENGAGEMENT_COOLDOWN_DAYS[category];
}

async function hasRecentOperationalContact(studentId: string, now: Date): Promise<boolean> {
  const guardStart = new Date(now);
  guardStart.setDate(guardStart.getDate() - RECENT_OPERATIONAL_CONTACT_GUARD_DAYS);

  const existing = await prisma.workoutEngagementNotification.findFirst({
    where: {
      studentId,
      eventType: { in: ["MISSED_WORKOUT_1", "MISSED_WORKOUT_2", "MISSED_WORKOUT_3"] },
      sentAt: { gte: guardStart },
    },
    select: { id: true },
  });

  return Boolean(existing);
}

async function computePriorEngagementRate(
  studentId: string,
  lastCompletedDate: Date
): Promise<number> {
  const windowStart = new Date(lastCompletedDate);
  windowStart.setDate(windowStart.getDate() - ENGAGED_LOOKBACK_WINDOW_DAYS);

  const [releasedCount, completedCount] = await Promise.all([
    prisma.workout.count({
      where: {
        studentId,
        date: { gte: windowStart, lte: lastCompletedDate },
        status: { in: ["PENDENTE", "CONCLUIDO", "NAO_REALIZADO"] },
      },
    }),
    prisma.workout.count({
      where: {
        studentId,
        date: { gte: windowStart, lte: lastCompletedDate },
        status: "CONCLUIDO",
      },
    }),
  ]);

  return releasedCount > 0 ? completedCount / releasedCount : 0;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const students = await resolveEligibleStudents();

  const results: any[] = [];
  const errors: any[] = [];

  for (const student of students) {
    try {
      const contract = student.contracts[0];
      if (!contract) {
        results.push({ studentId: student.id, sent: false, reason: "Sem contrato ativo encontrado" });
        continue;
      }

      const referenceStart = contract.activatedAt || contract.startDate;
      const daysSinceContractStart = daysBetween(referenceStart, now);

      const [totalCompletedWorkouts, lastCompleted] = await Promise.all([
        prisma.workout.count({ where: { studentId: student.id, status: "CONCLUIDO" } }),
        prisma.workout.findFirst({
          where: { studentId: student.id, status: "CONCLUIDO" },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
      ]);

      const daysSinceLastCompletedWorkout = lastCompleted
        ? daysBetween(lastCompleted.date, now)
        : null;

      const needsEngagementRate =
        totalCompletedWorkouts >= 3 &&
        lastCompleted !== null &&
        daysSinceLastCompletedWorkout !== null &&
        daysSinceLastCompletedWorkout >= QUIET_MIN_DAYS_SINCE_LAST_COMPLETED;

      const priorEngagementRate = needsEngagementRate
        ? await computePriorEngagementRate(student.id, lastCompleted!.date)
        : null;

      const category = classifyStudentReengagement({
        totalCompletedWorkouts,
        daysSinceContractStart,
        daysSinceLastCompletedWorkout,
        priorEngagementRate,
      });

      if (!category) {
        results.push({ studentId: student.id, sent: false, reason: "Aluno ativo, sem ação necessária" });
        continue;
      }

      if (await hasRecentCooldownEmail(student.id, category, now)) {
        results.push({ studentId: student.id, category, sent: false, reason: "E-mail dessa categoria já enviado recentemente" });
        continue;
      }

      if (await hasRecentOperationalContact(student.id, now)) {
        results.push({ studentId: student.id, category, sent: false, reason: "Aluno já recebeu cobrança operacional recente" });
        continue;
      }

      const to = getStudentEmail(student);
      if (!to) {
        results.push({ studentId: student.id, category, sent: false, reason: "Sem e-mail de aluno vinculado" });
        continue;
      }

      const { subject, text, html } = buildReengagementEmail(category, student.name || "Aluno");
      const eventTypeByCategory: Record<StudentReengagementCategory, string> = {
        NUNCA_COMECOU: "STUDENT_REENGAGEMENT_NEVER_STARTED",
        COMECOU_E_ABANDONOU: "STUDENT_REENGAGEMENT_ABANDONED",
        ENGAJADO_MAS_CAIU: "STUDENT_REENGAGEMENT_DROPPED_OFF",
      };

      await sendEmail({
        to,
        subject,
        text,
        html,
        eventType: eventTypeByCategory[category],
        recipientType: "STUDENT",
        contextId: student.id,
      });

      await prisma.studentReengagementEmail.create({
        data: { studentId: student.id, category },
      });

      results.push({ studentId: student.id, category, sent: true });
    } catch (error: any) {
      errors.push({ studentId: student.id, message: error?.message || "Erro desconhecido" });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    totals: {
      studentsEvaluated: students.length,
      emailsSent: results.filter((item) => item.sent).length,
      errors: errors.length,
    },
    results,
    errors,
  });
}
