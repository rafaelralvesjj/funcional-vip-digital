import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

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

function getWeeklyWorkoutLimitFromContract(contract?: {
  workoutsPerWeek?: number | null;
  workoutsPerMonth?: number | null;
} | null): number | null {
  if (!contract) return null;

  const directWeekly = Number(contract.workoutsPerWeek || 0);

  if (Number.isFinite(directWeekly) && directWeekly > 0) {
    return directWeekly;
  }

  const monthly = Number(contract.workoutsPerMonth || 0);

  if (!Number.isFinite(monthly) || monthly <= 0) {
    return null;
  }

  if (monthly <= 4) return 1;
  if (monthly <= 8) return 2;
  if (monthly <= 12) return 3;
  if (monthly <= 16) return 4;

  return 5;
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

function isFutureWeek(startOfWeek: Date): boolean {
  const currentWeek = getWeekRange(new Date());

  return startOfWeek.getTime() > currentWeek.startOfWeek.getTime();
}

function getStartOfNextWeek(): Date {
  return getWeekRange(new Date()).endOfWeek;
}

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function serializeWorkoutContract(contract: any) {
  if (!contract) return null;

  return {
    id: contract.id,
    type: contract.type,
    status: contract.status,
    commercialStatus: contract.commercialStatus,
    startDate: contract.startDate?.toISOString?.() || contract.startDate,
    endDate: contract.endDate?.toISOString?.() || contract.endDate,
    workoutsPerWeek: contract.workoutsPerWeek,
    workoutsPerMonth: contract.workoutsPerMonth,
    totalContractedWorkouts: contract.totalContractedWorkouts,
    planId: contract.planId || null,
    planName: contract.plan?.name || null,
  };
}

function sortWorkoutContractsByPriority<T extends { type?: string | null; endDate: Date }>(contracts: T[]): T[] {
  return contracts.sort((a, b) => {
    const aPriority = a.type === "PAID" ? 0 : 1;
    const bPriority = b.type === "PAID" ? 0 : 1;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return b.endDate.getTime() - a.endDate.getTime();
  });
}

async function findActiveWorkoutContract(studentId: string, workoutDate: Date) {
  const contracts = await prisma.studentContract.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lte: workoutDate,
      },
      endDate: {
        gte: workoutDate,
      },
    },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (contracts.length === 0) return null;

  return sortWorkoutContractsByPriority(contracts)[0];
}

async function findActiveWorkoutContractForWeek(studentId: string, week: { startOfWeek: Date; endOfWeek: Date }) {
  const contracts = await prisma.studentContract.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lt: week.endOfWeek,
      },
      endDate: {
        gte: week.startOfWeek,
      },
    },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (contracts.length === 0) return null;

  return sortWorkoutContractsByPriority(contracts)[0];
}

function normalizeWorkoutDateInsideContract(workoutDate: Date, contract: { startDate: Date; endDate: Date }): Date {
  const contractStart = new Date(contract.startDate);
  const contractEnd = new Date(contract.endDate);
  const workoutWeek = getWeekRange(workoutDate);

  if (
    workoutDate < contractStart &&
    contractStart >= workoutWeek.startOfWeek &&
    contractStart < workoutWeek.endOfWeek
  ) {
    const adjustedDate = new Date(contractStart);
    adjustedDate.setHours(12, 0, 0, 0);
    return adjustedDate;
  }

  if (
    workoutDate > contractEnd &&
    contractEnd >= workoutWeek.startOfWeek &&
    contractEnd < workoutWeek.endOfWeek
  ) {
    const adjustedDate = new Date(contractEnd);
    adjustedDate.setHours(12, 0, 0, 0);
    return adjustedDate;
  }

  return workoutDate;
}


async function normalizeExercisesFromOfficialLibrary(exercises: any[]) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error("O treino precisa ter pelo menos um exercício da biblioteca.");
  }

  const ids = exercises
    .map((ex) => String(ex?.libraryExerciseId || ex?.exerciseId || ex?.exerciseLibraryId || "").trim())
    .filter(Boolean);

  if (ids.length !== exercises.length) {
    throw new Error("Todos os exercícios do treino precisam vir da Biblioteca de Exercícios. Selecione exercícios cadastrados ou gere novamente pela IA usando exerciseId.");
  }

  const uniqueIds = Array.from(new Set(ids));

  const libraryExercises = await prisma.exerciseLibrary.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
      active: true,
    },
  });

  const libraryById = new Map(libraryExercises.map((exercise) => [exercise.id, exercise]));
  const missingIds = uniqueIds.filter((id) => !libraryById.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Um ou mais exercícios não existem ou estão inativos na biblioteca oficial: ${missingIds.join(", ")}.`);
  }

  return exercises.map((ex: any, index: number) => {
    const libraryExerciseId = String(ex?.libraryExerciseId || ex?.exerciseId || ex?.exerciseLibraryId || "").trim();
    const libraryExercise = libraryById.get(libraryExerciseId);

    if (!libraryExercise) {
      throw new Error("Exercício da biblioteca não encontrado.");
    }

    return {
      libraryExerciseId,
      name: libraryExercise.name,
      description: String(ex?.description || libraryExercise.description || ""),
      series: Number(ex?.series || 3),
      reps: ex?.reps ? String(ex.reps) : "10",
      weight: ex?.weight ? String(ex.weight) : null,
      restTime: ex?.restTime ? String(ex.restTime) : "60s",
      notes: ex?.notes ? String(ex.notes) : null,
      order: typeof ex?.order === "number" ? ex.order : index,
      videoUrl: String(ex?.videoUrl || libraryExercise.videoUrl || "") || null,
      imageUrl: String(ex?.imageUrl || libraryExercise.imageUrl || "") || null,
    };
  });
}


async function getStudentEmail(student: {
  email?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
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

async function notifyWorkoutAvailable({
  studentId,
  planName,
  isFirstWorkoutPackage,
  authorId,
  weeklyLimit,
  startOfWeek,
  endOfWeek,
}: {
  studentId: string;
  planName: string;
  isFirstWorkoutPackage: boolean;
  authorId: string | null;
  weeklyLimit: number;
  startOfWeek: Date;
  endOfWeek: Date;
}) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
    },
  });

  if (!student) return;

  const studentName = student.name || "Aluno";
  const studentEmail = await getStudentEmail(student);
  const loginUrl = getAppLoginUrl();

  const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const title = isFirstWorkoutPackage
    ? "Seus primeiros treinos da semana estão disponíveis"
    : "Seus treinos da semana estão disponíveis";

  const content = isFirstWorkoutPackage
    ? [
        `Seus ${weeklyLimit} treino(s) da semana já estão disponíveis no painel do aluno.`,
        `Semana de referência: ${weekLabel}.`,
        "",
        "Como este é seu primeiro pacote de treinos no sistema, separe uns 10 minutinhos antes de começar para olhar tudo com calma.",
        "Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.",
      ].join("\n")
    : [
        `Seus ${weeklyLimit} treino(s) da semana já estão disponíveis no painel do aluno.`,
        `Semana de referência: ${weekLabel}.`,
        "",
        "Acesse o sistema para visualizar as orientações e seguir sua programação.",
      ].join("\n");

  const notificationTasks: Promise<unknown>[] = [];

  /*
   * Evita duplicidade de aviso/e-mail para a mesma semana.
   * Como a tabela Notice não tem campo específico de semana do treino,
   * usamos o mesmo título e o texto com a semana de referência.
   */
  const existingWeekNotice = await prisma.notice.findFirst({
    where: {
      studentId,
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

  if (!existingWeekNotice && authorId) {
    notificationTasks.push(
      prisma.notice.create({
        data: {
          title,
          content,
          type: "WORKOUT",
          targetRole: "STUDENT",
          studentId,
          authorId,
          expiresAt: endOfWeek,
        },
      })
    );
  }

  if (!existingWeekNotice && studentEmail) {
    const safeStudentName = escapeHtml(studentName);
    const safePlanName = escapeHtml(planName);
    const safeWeekLabel = escapeHtml(weekLabel);

    const subject = title;

    const text = isFirstWorkoutPackage
      ? [
          `Olá, ${studentName}!`,
          "",
          `Seus ${weeklyLimit} treino(s) da semana estão disponíveis no Funcional Vip Digital.`,
          `Semana de referência: ${weekLabel}.`,
          "",
          "Como este é seu primeiro pacote de treinos no sistema, separe uns 10 minutinhos antes de começar para olhar tudo com calma.",
          "Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.",
          "",
          `Acessar o sistema: ${loginUrl}`,
        ].join("\n")
      : [
          `Olá, ${studentName}!`,
          "",
          `Seus ${weeklyLimit} treino(s) da semana estão disponíveis no Funcional Vip Digital.`,
          `Semana de referência: ${weekLabel}.`,
          "",
          "Acesse seu painel do aluno para visualizar as orientações e seguir sua programação.",
          "",
          `Acessar o sistema: ${loginUrl}`,
        ].join("\n");

    const introHtml = isFirstWorkoutPackage
      ? `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana estão disponíveis no Funcional Vip Digital.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Semana de referência: <strong style="color:#f5f5f5;">${safeWeekLabel}</strong>.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Como este é seu primeiro pacote de treinos no sistema, separe uns 10 minutinhos antes de começar para olhar tudo com calma.
            Veja os exercícios, imagens e orientações. Se surgir alguma dúvida, envie uma mensagem pelo chat antes de executar.
          </p>
        `
      : `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana estão disponíveis no Funcional Vip Digital.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Semana de referência: <strong style="color:#f5f5f5;">${safeWeekLabel}</strong>.
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.5;">
            Acesse seu painel do aluno para visualizar as orientações e seguir sua programação.
          </p>
        `;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#D4A373; margin:0 0 16px;">${escapeHtml(title)}</h2>

          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
            Olá, <strong>${safeStudentName}</strong>!
          </p>

          ${introHtml}

          <p style="color:#6b6b6b; font-size:11px; line-height:1.5;">
            Último treino salvo neste pacote: ${safePlanName}.
          </p>

          <a href="${loginUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">
            Acessar meus treinos
          </a>

          <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
            Este é um aviso automático do Funcional Vip Digital.
          </p>
        </div>
      </div>
    `;

    notificationTasks.push(
      sendEmail({
        to: studentEmail,
        subject,
        text,
        html,
      })
    );
  }

  if (notificationTasks.length > 0) {
    await Promise.allSettled(notificationTasks);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;

    const body = await req.json();
    const {
      studentId,
      name,
      description,
      date,
      notes,
      objective,
      focusAreas,
      intensity,
      estimatedDurationMinutes,
      estimatedCaloriesMin,
      estimatedCaloriesMax,
      studentSummary,
      safetyNote,
      exercises = [],
    } = body;

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json(
        { error: "studentId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    const studentExists = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        email: true,
        userId: true,
        userAuthId: true,
        contractedTrainingDaysPerMonth: true,
      },
    });

    if (!studentExists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const requestedWorkoutDate = date ? new Date(date + "T12:00:00") : new Date();
    const requestedWeek = getWeekRange(requestedWorkoutDate);

    let activeContract = await findActiveWorkoutContract(studentId, requestedWorkoutDate);

    /*
     * Aluno novo pode entrar no meio da semana.
     * Exemplo: dashboard abre a semana de segunda-feira, mas o contrato começou na quarta.
     * Nesse caso, a semana tem contrato ativo, porém a segunda-feira não tinha.
     * Usamos o contrato que cruza a semana e ajustamos a data efetiva para dentro do contrato.
     */
    if (!activeContract) {
      activeContract = await findActiveWorkoutContractForWeek(studentId, requestedWeek);
    }

    if (!activeContract) {
      return NextResponse.json(
        {
          error:
            "Este aluno não possui contrato ativo para a data do treino. Crie ou ative um contrato no Financeiro antes de montar novos treinos.",
        },
        { status: 400 }
      );
    }

    const workoutDate = normalizeWorkoutDateInsideContract(requestedWorkoutDate, activeContract);

    const existingWorkoutPlanCount = await prisma.workoutPlan.count({
      where: {
        studentId,
        contractId: activeContract.id,
      },
    });

    const isFirstWorkoutPlan = existingWorkoutPlanCount === 0;

    const weeklyLimit = getWeeklyWorkoutLimitFromContract(activeContract);

    if (!weeklyLimit) {
      return NextResponse.json(
        {
          error:
            "O contrato ativo do aluno não possui quantidade de treinos por semana configurada. Revise o contrato/plano no Financeiro.",
        },
        { status: 400 }
      );
    }

    const { startOfWeek, endOfWeek } = getWeekRange(workoutDate);

    const workoutPlansThisWeek = await prisma.workoutPlan.count({
      where: {
        studentId,
        contractId: activeContract.id,
        date: {
          gte: startOfWeek,
          lt: endOfWeek,
        },
      },
    });

    if (workoutPlansThisWeek >= weeklyLimit) {
      return NextResponse.json(
        {
          error: `Este aluno já recebeu ${workoutPlansThisWeek} treino(s) na semana de ${formatDatePtBr(
            startOfWeek
          )} a ${formatDatePtBr(
            new Date(endOfWeek.getTime() - 1)
          )}. O limite atual é de ${weeklyLimit} treino(s) por semana, conforme o contrato ativo.`,
        },
        { status: 400 }
      );
    }

    let normalizedExercises;

    try {
      normalizedExercises = await normalizeExercisesFromOfficialLibrary(exercises);
    } catch (validationError: any) {
      return NextResponse.json(
        { error: validationError?.message || "Exercícios inválidos." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          studentId,
          contractId: activeContract.id,
          name: name.trim(),
          description: description?.trim() || null,
          date: workoutDate,
          notes: notes?.trim() || null,
          objective: objective ? String(objective).trim() : null,
          focusAreas: focusAreas ? String(focusAreas).trim() : null,
          intensity: intensity ? String(intensity).trim() : null,
          estimatedDurationMinutes:
            estimatedDurationMinutes === null || estimatedDurationMinutes === undefined || estimatedDurationMinutes === ""
              ? null
              : Number(estimatedDurationMinutes),
          estimatedCaloriesMin:
            estimatedCaloriesMin === null || estimatedCaloriesMin === undefined || estimatedCaloriesMin === ""
              ? null
              : Number(estimatedCaloriesMin),
          estimatedCaloriesMax:
            estimatedCaloriesMax === null || estimatedCaloriesMax === undefined || estimatedCaloriesMax === ""
              ? null
              : Number(estimatedCaloriesMax),
          studentSummary: studentSummary ? String(studentSummary).trim() : null,
          safetyNote: safetyNote ? String(safetyNote).trim() : null,
          exercises: {
            create: normalizedExercises,
          },
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });

      // CRIAR TAMBÉM UM Workout COM status "PENDENTE"
      // para que o dashboard possa contabilizar os treinos pendentes
      await tx.workout.create({
        data: {
          studentId,
          contractId: activeContract.id,
          workoutPlanId: plan.id,
          date: workoutDate,
          status: "PENDENTE",
        },
      });

      return plan;
    });

    const workoutsThisWeekAfterCreate = workoutPlansThisWeek + 1;
    const isWeeklyPackageComplete = workoutsThisWeekAfterCreate >= weeklyLimit;
    const futureWeek = isFutureWeek(startOfWeek);
    let emailSent = false;

    /*
     * Regra de liberação para o aluno:
     *
     * - Professor pode montar treino de semana futura.
     * - Gestor/professor conseguem ver e controlar o planejamento.
     * - Aluno NÃO recebe e-mail/aviso quando a semana ainda é futura.
     * - Aluno só enxerga treinos da semana vigente ou semanas anteriores.
     */
    if (isWeeklyPackageComplete && !futureWeek) {
      try {
        const fallbackAuthorId = await getFallbackNoticeAuthorId(studentExists.userId);
        const authorId = currentUserId || fallbackAuthorId;

        await notifyWorkoutAvailable({
          studentId,
          planName: result.name,
          isFirstWorkoutPackage: isFirstWorkoutPlan || existingWorkoutPlanCount < weeklyLimit,
          authorId,
          weeklyLimit,
          startOfWeek,
          endOfWeek,
        });

        emailSent = true;
      } catch (notificationError) {
        console.error("Erro ao notificar aluno sobre treinos da semana:", notificationError);
      }
    }

    const weekEndDisplay = new Date(endOfWeek.getTime() - 1);

    return NextResponse.json(
      {
        ...result,
        weeklyNotification: {
          weeklyLimit,
          workoutsThisWeek: workoutsThisWeekAfterCreate,
          weekComplete: isWeeklyPackageComplete,
          futureWeek,
          emailSent,
          message: isWeeklyPackageComplete
            ? futureWeek
              ? `Semana futura planejada. O aluno só verá estes treinos na semana de ${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}. Nenhum e-mail foi enviado agora.`
              : "Meta semanal completa. Aluno notificado sobre os treinos da semana."
            : `Treino salvo. Ainda falta(m) ${weeklyLimit - workoutsThisWeekAfterCreate} treino(s) para completar a semana.`,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;
    const role = normalizeRole(sessionUser?.role);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const studentId = searchParams.get("studentId");
    const includeSummary = searchParams.get("summary") === "1";
    const referenceDateParam = searchParams.get("date");
    const referenceDate = referenceDateParam
      ? new Date(`${referenceDateParam}T12:00:00`)
      : new Date();
    const startOfNextWeek = getStartOfNextWeek();
    const isStudentUser = role === "STUDENT";

    if (id) {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (!plan) {
        return NextResponse.json(
          { error: "Workout plan not found" },
          { status: 404 }
        );
      }

      if (isStudentUser) {
        const student = await prisma.student.findUnique({
          where: { id: plan.studentId },
          select: {
            userAuthId: true,
          },
        });

        if (!student || student.userAuthId !== currentUserId) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
        }

        if (plan.date && plan.date >= startOfNextWeek) {
          return NextResponse.json(
            { error: "Este treino ainda não está disponível para o aluno." },
            { status: 404 }
          );
        }
      }

      return NextResponse.json(plan);
    }

    if (studentId) {
      const where: any = { studentId };

      if (isStudentUser) {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: {
            userAuthId: true,
          },
        });

        if (!student || student.userAuthId !== currentUserId) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
        }

        // Aluno só vê treinos da semana vigente ou anteriores.
        // Treinos de semana futura ficam escondidos inclusive das bolinhas do calendário,
        // desde que o calendário use esta rota para buscar os treinos.
        where.date = {
          lt: startOfNextWeek,
        };
      }

      const plans = await prisma.workoutPlan.findMany({
        where,
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!includeSummary) {
        return NextResponse.json(plans);
      }

      const { startOfWeek, endOfWeek } = getWeekRange(referenceDate);
      const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
      let activeContract = await findActiveWorkoutContract(studentId, referenceDate);

      if (!activeContract) {
        activeContract = await findActiveWorkoutContractForWeek(studentId, {
          startOfWeek,
          endOfWeek,
        });
      }

      const effectiveWorkoutDate = activeContract
        ? normalizeWorkoutDateInsideContract(referenceDate, activeContract)
        : referenceDate;
      const weeklyLimit = getWeeklyWorkoutLimitFromContract(activeContract);

      const weeklyPlansCount = activeContract
        ? await prisma.workoutPlan.count({
            where: {
              studentId,
              contractId: activeContract.id,
              date: {
                gte: startOfWeek,
                lt: endOfWeek,
              },
            },
          })
        : 0;

      const selectedDateBeforeContractStart = Boolean(
        activeContract && referenceDate < activeContract.startDate
      );

      return NextResponse.json({
        plans,
        activeContract: serializeWorkoutContract(activeContract),
        weeklyLimit,
        weeklyPlansCount,
        weeklyRemaining:
          weeklyLimit == null ? null : Math.max(weeklyLimit - weeklyPlansCount, 0),
        week: {
          startOfWeek: startOfWeek.toISOString(),
          endOfWeek: endOfWeek.toISOString(),
          label: `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`,
          futureWeek: isFutureWeek(startOfWeek),
        },
        effectiveWorkoutDate: effectiveWorkoutDate.toISOString().slice(0, 10),
        canCreateWorkout: Boolean(activeContract && weeklyLimit && weeklyPlansCount < weeklyLimit),
        message: activeContract
          ? selectedDateBeforeContractStart
            ? `Contrato ativo encontrado para esta semana. Como o contrato começa em ${formatDatePtBr(activeContract.startDate)}, o treino será salvo a partir dessa data.`
            : null
          : "Este aluno não possui contrato ativo para a data selecionada.",
      });
    }

    return NextResponse.json(
      { error: "Provide either id or studentId query parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("GET /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      description,
      date,
      notes,
      objective,
      focusAreas,
      intensity,
      estimatedDurationMinutes,
      estimatedCaloriesMin,
      estimatedCaloriesMax,
      studentSummary,
      safetyNote,
      exercises,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        contractId: true,
      },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    if (exercises !== undefined && !Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    if (exercises !== undefined && exercises.length === 0) {
      return NextResponse.json(
        { error: "O treino precisa ter pelo menos um exercício." },
        { status: 400 }
      );
    }

    const data: any = {};

    if (name !== undefined) data.name = String(name || "").trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;
    if (date !== undefined) data.date = date ? new Date(date + "T12:00:00") : null;

    let nextContractId: string | null = null;

    if (data.date) {
      const requestedDate = data.date;
      const requestedWeek = getWeekRange(requestedDate);
      let activeContract = await findActiveWorkoutContract(planExists.studentId, requestedDate);

      if (!activeContract) {
        activeContract = await findActiveWorkoutContractForWeek(planExists.studentId, requestedWeek);
      }

      if (!activeContract) {
        return NextResponse.json(
          {
            error:
              "Este aluno não possui contrato ativo para a nova data do treino. Ajuste a data ou regularize o contrato no Financeiro.",
          },
          { status: 400 }
        );
      }

      data.date = normalizeWorkoutDateInsideContract(requestedDate, activeContract);
      data.contractId = activeContract.id;
      nextContractId = activeContract.id;
    }
    if (objective !== undefined) data.objective = objective ? String(objective).trim() : null;
    if (focusAreas !== undefined) data.focusAreas = focusAreas ? String(focusAreas).trim() : null;
    if (intensity !== undefined) data.intensity = intensity ? String(intensity).trim() : null;
    if (estimatedDurationMinutes !== undefined) {
      data.estimatedDurationMinutes =
        estimatedDurationMinutes === null || estimatedDurationMinutes === ""
          ? null
          : Number(estimatedDurationMinutes);
    }
    if (estimatedCaloriesMin !== undefined) {
      data.estimatedCaloriesMin =
        estimatedCaloriesMin === null || estimatedCaloriesMin === ""
          ? null
          : Number(estimatedCaloriesMin);
    }
    if (estimatedCaloriesMax !== undefined) {
      data.estimatedCaloriesMax =
        estimatedCaloriesMax === null || estimatedCaloriesMax === ""
          ? null
          : Number(estimatedCaloriesMax);
    }
    if (studentSummary !== undefined) data.studentSummary = studentSummary ? String(studentSummary).trim() : null;
    if (safetyNote !== undefined) data.safetyNote = safetyNote ? String(safetyNote).trim() : null;

    let normalizedExercises = null;

    if (Array.isArray(exercises)) {
      try {
        normalizedExercises = await normalizeExercisesFromOfficialLibrary(exercises);
      } catch (validationError: any) {
        return NextResponse.json(
          { error: validationError?.message || "Exercícios inválidos." },
          { status: 400 }
        );
      }
    }

    const plan = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.workoutPlan.update({
          where: { id },
          data,
        });
      }

      if (data.date !== undefined) {
        await tx.workout.updateMany({
          where: { workoutPlanId: id },
          data: {
            date: data.date,
            ...(nextContractId ? { contractId: nextContractId } : {}),
          },
        });
      }

      if (normalizedExercises) {
        await tx.exercise.deleteMany({
          where: { workoutPlanId: id },
        });

        await tx.exercise.createMany({
          data: normalizedExercises.map((exercise: any) => ({
            ...exercise,
            workoutPlanId: id,
          })),
        });
      }

      return tx.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });
    });

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("PUT /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.exercise.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workout.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workoutPlan.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error("DELETE /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}
