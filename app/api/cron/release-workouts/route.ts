import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type StudentForRelease = {
  id: string;
  name: string | null;
  email: string | null;
  userAuthId: string | null;
  userId: string | null;
  contractedTrainingDaysPerMonth: number | null;
  user?: {
    name: string | null;
  } | null;
};

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
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

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function getStudentEmail(student: StudentForRelease): Promise<string | null> {
  if (student.email) return student.email;

  if (!student.userAuthId) return null;

  const userAuth = await prisma.user.findUnique({
    where: { id: student.userAuthId },
    select: { email: true },
  });

  return userAuth?.email || null;
}

async function getFallbackNoticeAuthorId(studentProfessorId?: string | null): Promise<string | null> {
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
  });

  return gestor?.id || null;
}

async function notifyWorkoutAvailableForCurrentWeek({
  student,
  weeklyLimit,
  startOfWeek,
  endOfWeek,
  isFirstWorkoutPackage,
  lastPlanName,
}: {
  student: StudentForRelease;
  weeklyLimit: number;
  startOfWeek: Date;
  endOfWeek: Date;
  isFirstWorkoutPackage: boolean;
  lastPlanName: string;
}) {
  const studentName = student.name || "Aluno";
  const professorName = student.user?.name || "seu professor";
  const studentEmail = await getStudentEmail(student);
  const authorId = await getFallbackNoticeAuthorId(student.userId);
  const loginUrl = getAppLoginUrl();

  const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const title = isFirstWorkoutPackage
    ? "Seus primeiros treinos já estão disponíveis"
    : "Seus treinos da semana estão disponíveis";

  const content = isFirstWorkoutPackage
    ? [
        `Oi, ${studentName}!`,
        "",
        `Eu sou ${professorName} e vou acompanhar seus treinos e sua evolução no Funcional VIP Digital.`,
        `Seus ${weeklyLimit} treino(s) da semana de ${weekLabel} já estão disponíveis.`,
        "",
        "Como este é o seu primeiro treino, separe cerca de 10 minutos antes de começar para olhar tudo com calma: exercícios, imagens, orientações, séries, repetições e cuidados de execução.",
        "Se surgir qualquer dúvida, fale comigo pelo chat da plataforma antes de executar. Esse será nosso principal canal de comunicação sobre treino, porque mantém o acompanhamento registrado e organizado.",
        "Durante ou ao finalizar o treino, nunca deixe de registrar qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Use o registro do próprio treino ao concluir a sessão. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma. Essas informações chegam ao professor e impactam diretamente a montagem dos próximos treinos.",
        "Acompanhe também seus e-mails e os avisos da plataforma. Para dúvidas de treino, não responda pelo WhatsApp; esse canal fica reservado para contatos específicos da gestão.",
        "",
        "Conte comigo nesse processo. Vamos evoluir com segurança, consistência e respeitando o seu momento.",
        "",
        professorName,
        "Funcional VIP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n")
    : [
        `Oi, ${studentName}!`,
        "",
        `Sou ${professorName}. Seus ${weeklyLimit} treino(s) da semana de ${weekLabel} já estão disponíveis.`,
        "Antes de começar, confira as orientações, imagens, séries, repetições e cuidados de cada exercício.",
        "Se tiver dúvida ou precisar contar como foi a execução, use o chat da plataforma. Assim, consigo acompanhar seu histórico e ajustar os próximos treinos com mais segurança.",
        "Lembre-se de registrar no próprio treino qualquer incômodo, dor ou desconforto. Se precisar falar antes de concluir ou tiver dúvida sobre continuar, use o chat da plataforma. Seu relato faz parte do acompanhamento e influencia diretamente os próximos treinos.",
        "Para assuntos de treino, não responda pelo WhatsApp. A gestão pode usar esse canal em situações específicas.",
        "",
        "Bom treino!",
        professorName,
        "Funcional VIP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n");

  const existingWeekNotice = await prisma.notice.findFirst({
    where: {
      studentId: student.id,
      type: "WORKOUT",
      targetRole: "STUDENT",
      title,
      content: {
        contains: weekLabel,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingWeekNotice) {
    return {
      sent: false,
      skipped: true,
      reason: "Aviso da semana já existia",
    };
  }

  if (authorId) {
    await prisma.notice.create({
      data: {
        title,
        content,
        type: "WORKOUT",
        targetRole: "STUDENT",
        studentId: student.id,
        authorId,
      },
    });
  }

  if (studentEmail) {
    const safeStudentName = escapeHtml(studentName);
    const safeProfessorName = escapeHtml(professorName);
    const safeWeekLabel = escapeHtml(weekLabel);
    const safeLastPlanName = escapeHtml(lastPlanName || "Treino da semana");

    const subject = title;
    const text = `${content}\n\nAcessar meus treinos: ${loginUrl}`;

    const introHtml = isFirstWorkoutPackage
      ? `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Eu sou <strong style="color:#f5f5f5;">${safeProfessorName}</strong> e vou acompanhar seus treinos e sua evolução no Funcional VIP Digital.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana de <strong style="color:#f5f5f5;">${safeWeekLabel}</strong> já estão disponíveis.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Como este é o seu primeiro treino, separe cerca de 10 minutos antes de começar para conferir exercícios, imagens, orientações, séries, repetições e cuidados de execução.
          </p>
        `
      : `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Sou <strong style="color:#f5f5f5;">${safeProfessorName}</strong>. Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana de <strong style="color:#f5f5f5;">${safeWeekLabel}</strong> já estão disponíveis.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Antes de começar, confira as orientações, imagens, séries, repetições e cuidados de cada exercício.
          </p>
        `;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#D4A373; margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
          ${introHtml}
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se surgir qualquer dúvida, use o chat da plataforma antes de executar. Esse é o canal principal entre você e o professor, porque mantém o acompanhamento registrado e organizado.</p>
          <div style="background:#1a1510; border:1px solid #7c5228; border-radius:12px; padding:14px; margin:14px 0;">
            <p style="color:#D4A373; font-size:14px; font-weight:bold; margin:0 0 8px;">Seu relato ajuda a montar o próximo treino</p>
            <p style="color:#d4d4d4; font-size:13px; line-height:1.6; margin:0;">Durante ou ao finalizar o treino, nunca deixe de registrar qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Use o registro do próprio treino ao concluir a sessão. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma. Essas informações chegam ao professor e impactam diretamente a montagem dos próximos treinos.</p>
          </div>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para dúvidas de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.</p>
          <a href="${loginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">Acessar meus treinos</a>
          <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional VIP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; line-height:1.5; margin-top:4px;">Mensagem automática de acompanhamento enviada em nome do seu professor.<br />Último treino salvo neste pacote: ${safeLastPlanName}.</p>
        </div>
      </div>
    `;

    await sendEmail({
      to: studentEmail,
      subject,
      text,
      html,
    });
  }

  return {
    sent: Boolean(studentEmail || authorId),
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

  const { startOfWeek, endOfWeek } = getWeekRange(new Date());

  const allActiveStudents = await prisma.student.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
      userId: true,
      contractedTrainingDaysPerMonth: true,
      user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  /*
   * Filtramos professor vinculado e dias contratados em memória para evitar
   * incompatibilidade de tipo quando o Prisma Client do projeto trata userId
   * como string obrigatória em vez de string nullable.
   */
  const students = allActiveStudents.filter((student) => {
    const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

    return Boolean(student.userId) && Boolean(weeklyLimit);
  });

  const released: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const student of students) {
    try {
      const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

      if (!weeklyLimit) {
        skipped.push({ studentId: student.id, studentName: student.name, reason: "Sem limite semanal" });
        continue;
      }

      const plansThisWeek = await prisma.workoutPlan.findMany({
        where: {
          studentId: student.id,
          date: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
        },
        select: {
          id: true,
          name: true,
          date: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (plansThisWeek.length < weeklyLimit) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: `Semana incompleta: ${plansThisWeek.length}/${weeklyLimit}`,
        });
        continue;
      }

      const previousPlanCount = await prisma.workoutPlan.count({
        where: {
          studentId: student.id,
          date: {
            lt: startOfWeek,
          },
        },
      });

      /*
       * Libera de fato os treinos da semana para o calendário do aluno.
       * O aviso/e-mail sozinho não torna o treino visível: a API do aluno
       * oculta registros com status PRE_PLANEJADO.
       */
      const releasedWorkouts = await prisma.workout.updateMany({
        where: {
          studentId: student.id,
          date: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
          status: "PRE_PLANEJADO",
        },
        data: {
          status: "PENDENTE",
        },
      });

      const notification = await notifyWorkoutAvailableForCurrentWeek({
        student,
        weeklyLimit,
        startOfWeek,
        endOfWeek,
        isFirstWorkoutPackage: previousPlanCount === 0,
        lastPlanName: plansThisWeek[0]?.name || "Treino da semana",
      });

      if (notification.skipped) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: notification.reason,
        });
      } else {
        released.push({
          studentId: student.id,
          studentName: student.name,
          weeklyLimit,
          plansThisWeek: plansThisWeek.length,
          workoutsReleased: releasedWorkouts.count,
          emailOrNoticeSent: notification.sent,
        });
      }
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
    week: {
      start: startOfWeek.toISOString(),
      end: endOfWeek.toISOString(),
      label: `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(new Date(endOfWeek.getTime() - 1))}`,
    },
    totals: {
      studentsChecked: students.length,
      released: released.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    released,
    skipped,
    errors,
  });
}
