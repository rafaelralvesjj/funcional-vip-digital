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

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  // Regra comercial atual:
  // até 4 treinos/mês  -> 1 treino por semana
  // até 8 treinos/mês  -> 2 treinos por semana
  // até 12 treinos/mês -> 3 treinos por semana
  // até 16 treinos/mês -> 4 treinos por semana
  // acima disso        -> 5 treinos por semana, limitado a dias úteis.
  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 12) return 3;
  if (contracted <= 16) return 4;

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

    const existingWorkoutPlanCount = await prisma.workoutPlan.count({
      where: { studentId },
    });

    const isFirstWorkoutPlan = existingWorkoutPlanCount === 0;

    const workoutDate = date ? new Date(date + "T12:00:00") : new Date();
    const weeklyLimit = getWeeklyWorkoutLimit(studentExists.contractedTrainingDaysPerMonth);

    if (!weeklyLimit) {
      return NextResponse.json(
        {
          error:
            "Este aluno ainda não tem quantidade contratada de treinos/dias no mês configurada. Vincule o aluno na gestão e preencha a quantidade contratada antes de montar o treino.",
        },
        { status: 400 }
      );
    }

    const { startOfWeek, endOfWeek } = getWeekRange(workoutDate);

    const workoutPlansThisWeek = await prisma.workoutPlan.count({
      where: {
        studentId,
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
          )}. O limite atual é de ${weeklyLimit} treino(s) por semana, conforme a quantidade contratada no mês.`,
        },
        { status: 400 }
      );
    }

    const normalizedExercises = exercises.map((ex: any, index: number) => ({
      name: ex.name,
      description: ex.description,
      series: ex.series,
      reps: ex.reps,
      weight: ex.weight,
      restTime: ex.restTime,
      notes: ex.notes,
      order: typeof ex.order === "number" ? ex.order : index,
      videoUrl: ex.videoUrl,
      imageUrl: ex.imageUrl,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          studentId,
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

      return NextResponse.json(plans);
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
      select: { id: true },
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

    const normalizedExercises = Array.isArray(exercises)
      ? exercises.map((ex: any, index: number) => ({
          name: ex.name,
          description: ex.description,
          series: Number(ex.series) || 1,
          reps: ex.reps,
          weight: ex.weight,
          restTime: ex.restTime,
          notes: ex.notes,
          order: typeof ex.order === "number" ? ex.order : index,
          videoUrl: ex.videoUrl,
          imageUrl: ex.imageUrl,
        }))
      : null;

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
