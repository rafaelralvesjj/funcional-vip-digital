import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import { resolveStudentRecipientEmail } from "@/lib/email-recipient-policy";
import { buildWorkoutReleaseCommunication } from "@/lib/student-experience";

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
  contracts: Array<{
    id: string;
    workoutsPerWeek: number;
    workoutsPerMonth: number;
    professorId: string | null;
    startDate: Date;
    endDate: Date;
  }>;
};

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

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

function getWeekToRelease(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const currentWeek = getWeekRange(referenceDate);

  // Este cron roda aos domingos, às 15h no horário de Brasília.
  // Nesse momento, liberamos a semana que começa na segunda-feira seguinte.
  if (referenceDate.getUTCDay() === 0) {
    const startOfWeek = new Date(currentWeek.endOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return { startOfWeek, endOfWeek };
  }

  return currentWeek;
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function getStudentEmail(student: StudentForRelease): Promise<string | null> {
  return resolveStudentRecipientEmail({
    studentId: student.id,
    studentEmail: student.email,
    userAuthId: student.userAuthId,
  });
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

  const communication = buildWorkoutReleaseCommunication({
    studentName,
    professorName,
    weeklyLimit,
    weekLabel,
    isFirstWorkoutPackage,
    loginUrl,
  });
  const title = communication.title;
  const content = communication.noticeContent;

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
    await sendEmail({
      to: studentEmail,
      subject: communication.subject,
      text: communication.text,
      html: communication.html,
      eventType: "WORKOUTS_RELEASED",
      recipientType: "STUDENT",
      contextId: student.id,
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

  const now = new Date();
  const { startOfWeek, endOfWeek } = getWeekToRelease(now);

  const allActiveStudents = (await prisma.student.findMany({
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
      contracts: {
        where: {
          status: "ACTIVE",
          // No domingo, o contrato pode começar somente na segunda-feira.
          // Por isso buscamos contratos que cruzem a semana que será liberada.
          startDate: {
            lt: endOfWeek,
          },
          endDate: {
            gte: startOfWeek,
          },
        },
        select: {
          id: true,
          workoutsPerWeek: true,
          workoutsPerMonth: true,
          professorId: true,
          startDate: true,
          endDate: true,
        },
        orderBy: {
          endDate: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      name: "asc",
    },
  })) as StudentForRelease[];

  const students = allActiveStudents.filter((student) => {
    const activeContract = student.contracts[0];
    const weeklyLimit = activeContract?.workoutsPerWeek ||
      getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);
    const professorId = activeContract?.professorId || student.userId;

    return Boolean(professorId) && Number(weeklyLimit) > 0;
  });

  const released: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const student of students) {
    try {
      const activeContract = student.contracts[0] || null;
      const weeklyLimit = Number(
        activeContract?.workoutsPerWeek ||
          getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth) ||
          0
      );

      if (!weeklyLimit) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: "Contrato ativo sem quantidade semanal configurada",
        });
        continue;
      }

      const lowAdherencePause = await prisma.studentCareEvent.findFirst({
        where: {
          studentId: student.id,
          eventType: "PAUSA_BAIXA_ADERENCIA",
          status: { not: "RESOLVIDO" },
        },
        select: { id: true, status: true },
      });

      if (lowAdherencePause) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: "Treinos pausados por baixa adesão; aguardando retomada e liberação do professor",
        });
        continue;
      }

      const plansThisWeek = await prisma.workoutPlan.findMany({
        where: {
          studentId: student.id,
          active: true,
          ...(activeContract ? { contractId: activeContract.id } : {}),
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
          workouts: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: {
          date: "asc",
        },
      });

      if (plansThisWeek.length < weeklyLimit) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          contractId: activeContract?.id || null,
          reason: `Semana incompleta: ${plansThisWeek.length}/${weeklyLimit}`,
        });
        continue;
      }

      const planIds = plansThisWeek.map((plan: { id: string }) => plan.id);
      const workoutIds = plansThisWeek.flatMap(
        (plan: { workouts: Array<{ id: string }> }) =>
          plan.workouts.map((workout: { id: string }) => workout.id)
      );

      if (workoutIds.length === 0) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          contractId: activeContract?.id || null,
          reason: "Os planos existem, mas não possuem registros em workouts",
        });
        continue;
      }

      // Mesma regra usada pela liberação manual da semana:
      // todos os workouts dos planos selecionados passam para PENDENTE.
      const releasedWorkouts = await prisma.workout.updateMany({
        where: {
          id: {
            in: workoutIds,
          },
          studentId: student.id,
          workoutPlanId: {
            in: planIds,
          },
        },
        data: {
          status: "PENDENTE",
        },
      });

      // Confirma no banco antes de avisar o aluno.
      const hiddenAfterRelease = await prisma.workout.count({
        where: {
          id: {
            in: workoutIds,
          },
          status: {
            not: "PENDENTE",
          },
        },
      });

      if (hiddenAfterRelease > 0) {
        throw new Error(
          `Falha ao confirmar a liberação: ${hiddenAfterRelease} treino(s) ainda não estão como PENDENTE.`
        );
      }

      const previousPlanCount = await prisma.workoutPlan.count({
        where: {
          studentId: student.id,
          ...(activeContract ? { contractId: activeContract.id } : {}),
          date: {
            lt: startOfWeek,
          },
        },
      });

      // Usa o professor do contrato ativo como fonte principal.
      const studentForNotification: StudentForRelease = {
        ...student,
        userId: activeContract?.professorId || student.userId,
      };

      const notification = await notifyWorkoutAvailableForCurrentWeek({
        student: studentForNotification,
        weeklyLimit,
        startOfWeek,
        endOfWeek,
        isFirstWorkoutPackage: previousPlanCount === 0,
        lastPlanName:
          plansThisWeek[plansThisWeek.length - 1]?.name || "Treino da semana",
      });

      released.push({
        studentId: student.id,
        studentName: student.name,
        contractId: activeContract?.id || null,
        weeklyLimit,
        plansThisWeek: plansThisWeek.length,
        workoutsFound: workoutIds.length,
        workoutsUpdated: releasedWorkouts.count,
        releaseConfirmed: true,
        notificationSent: notification.sent,
        notificationSkipped: notification.skipped,
        notificationReason: notification.reason,
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
    week: {
      start: startOfWeek.toISOString(),
      end: endOfWeek.toISOString(),
      label: `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(
        new Date(endOfWeek.getTime() - 1)
      )}`,
    },
    totals: {
      activeStudentsFound: allActiveStudents.length,
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
