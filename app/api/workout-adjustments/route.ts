import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";


type AdjustmentAction =
  | "PREPARE_PROMPT"
  | "VALIDATE_MANUAL"
  | "APPLY"
  | "FUTURE_ONLY";

type ProposedExercise = {
  exerciseId: string;
  exerciseName?: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
};

type LibraryExerciseRecord = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

type AdjustmentProposal = {
  name: string;
  description: string;
  objective: string;
  focusAreas: string;
  intensity: string;
  estimatedDurationMinutes: number;
  estimatedCaloriesMin: number;
  estimatedCaloriesMax: number;
  studentSummary: string;
  safetyNote: string;
  notes: string;
  rationale: string;
  studentMessage: string;
  exercises: ProposedExercise[];
};

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();

  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";

  return role;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) return fallback;

  return Math.round(parsed);
}

function getCurrentWeekRange() {
  const now = new Date();
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return { startOfWeek, endOfWeek };
}

async function getAdjustmentContext({
  preferenceId,
  workoutId,
  userId,
  role,
  requireWorkout = true,
}: {
  preferenceId: string;
  workoutId?: string | null;
  userId: string;
  role: string;
  requireWorkout?: boolean;
}) {
  const preference = await prisma.studentTrainingPreference.findUnique({
    where: { id: preferenceId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          userId: true,
          notes: true,
          contractedTrainingDaysPerMonth: true,
          userAuth: {
            select: {
              birthDate: true,
            },
          },
        },
      },
    },
  });

  if (!preference || preference.status !== "ACTIVE") {
    return {
      error: "Solicitação de ajuste não encontrada ou inativa.",
      status: 404 as const,
    };
  }

  const canAccess =
    role === "GESTOR" ||
    role === "ADMIN" ||
    (role === "TEACHER" &&
      (preference.professorId === userId || preference.student.userId === userId));

  if (!canAccess) {
    return {
      error: "Você não tem permissão para ajustar este treino.",
      status: 403 as const,
    };
  }

  if (!requireWorkout) {
    return {
      preference,
      workout: null,
      activePreferences: [],
    };
  }

  const effectiveWorkoutId = workoutId || preference.relatedWorkoutId;

  if (!effectiveWorkoutId) {
    return {
      error: "Não existe treino pendente relacionado a esta preferência.",
      status: 409 as const,
    };
  }

  const workout = await prisma.workout.findUnique({
    where: { id: effectiveWorkoutId },
    include: {
      workoutPlan: {
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
          workouts: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!workout || workout.studentId !== preference.studentId || !workout.workoutPlan) {
    return { error: "Treino pendente não localizado.", status: 404 as const };
  }

  if (String(workout.status || "").toUpperCase() !== "PENDENTE") {
    return {
      error: "Somente treino com status PENDENTE pode ser adaptado por este fluxo.",
      status: 409 as const,
    };
  }

  const { startOfWeek, endOfWeek } = getCurrentWeekRange();

  if (workout.date < startOfWeek || workout.date >= endOfWeek) {
    return {
      error: "Este fluxo ajusta somente treino pendente da semana atual.",
      status: 409 as const,
    };
  }

  const activePreferences = await prisma.studentTrainingPreference.findMany({
    where: {
      studentId: preference.studentId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      category: true,
      summary: true,
      originalMessage: true,
    },
  });

  return {
    preference,
    workout,
    activePreferences,
  };
}

function buildAdjustmentPrompt({
  context,
  library,
}: {
  context: any;
  library: any[];
}): string {
  const plan = context.workout.workoutPlan;
  const currentExercises = plan.exercises.map((exercise: any) => ({
    exerciseId: exercise.libraryExerciseId,
    name: exercise.name,
    series: exercise.series,
    reps: exercise.reps,
    weight: exercise.weight,
    restTime: exercise.restTime,
    notes: exercise.notes,
    order: exercise.order,
  }));

  const availableExercises = library.map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    description: exercise.description,
    objectiveTags: exercise.objectiveTags,
    locationTags: exercise.locationTags,
    equipmentTags: exercise.equipmentTags,
    restrictionTags: exercise.restrictionTags,
    levelTags: exercise.levelTags,
    intensity: exercise.intensity,
    safetyNotes: exercise.safetyNotes,
    contraindications: exercise.contraindications,
  }));

  const requiredResponseExample = {
    name: "Nome do treino adaptado",
    description: "Descrição objetiva do treino",
    objective: "Objetivo principal",
    focusAreas: "Áreas de foco",
    intensity: "Intensidade",
    estimatedDurationMinutes: 45,
    estimatedCaloriesMin: 0,
    estimatedCaloriesMax: 0,
    studentSummary: "Resumo simples para o aluno",
    safetyNote: "Orientação de segurança, sem inventar restrições",
    notes: "Observações para o professor",
    rationale: "Explique de forma objetiva o que foi alterado e por quê",
    studentMessage:
      "Mensagem humana para informar ao aluno que o treino pendente foi ajustado após revisão do professor.",
    exercises: [
      {
        exerciseId: "ID_EXATO_DA_BIBLIOTECA",
        series: 3,
        reps: "10",
        weight: "",
        restTime: "60s",
        notes: "",
        order: 0,
      },
    ],
  };

  return [
    "Você é um assistente de prescrição de treino que apoia um professor de educação física.",
    "Adapte SOMENTE o treino pendente informado. O treino já concluído não pode ser alterado.",
    "A proposta será revisada e confirmada pelo professor antes de substituir o treino atual.",
    "Use exclusivamente exerciseId da biblioteca oficial fornecida.",
    "Mantenha a data, o objetivo geral e uma duração coerente, mas substitua os exercícios incompatíveis com as preferências ativas.",
    "Não invente lesões, restrições, equipamentos, cargas ou diagnósticos.",
    "Não transforme preferência em evento de cuidado.",
    "Evite cardio de academia quando a preferência disser que o cardio ocorre somente na corrida de rua.",
    "Priorize musculação nos dias de academia quando essa preferência estiver registrada.",
    "Retorne SOMENTE um JSON válido, sem markdown, sem crases, sem comentários e sem texto antes ou depois.",
    "Mantenha exatamente todos os campos do modelo de resposta.",
    "O campo exercises deve conter ao menos um exercício e todos os exerciseId devem existir na biblioteca fornecida.",
    "Os campos numéricos devem ser números, não textos.",
    "",
    `ALUNO: ${context.preference.student.name}`,
    `DATA DO TREINO: ${context.workout.date.toISOString().slice(0, 10)}`,
    "",
    "PREFERÊNCIA QUE GEROU O AJUSTE:",
    JSON.stringify(
      {
        category: context.preference.category,
        summary: context.preference.summary,
        originalMessage: context.preference.originalMessage,
      },
      null,
      2
    ),
    "",
    "TODAS AS PREFERÊNCIAS ATIVAS:",
    JSON.stringify(context.activePreferences, null, 2),
    "",
    "TREINO ATUAL:",
    JSON.stringify(
      {
        name: plan.name,
        description: plan.description,
        objective: plan.objective,
        focusAreas: plan.focusAreas,
        intensity: plan.intensity,
        estimatedDurationMinutes: plan.estimatedDurationMinutes,
        estimatedCaloriesMin: plan.estimatedCaloriesMin,
        estimatedCaloriesMax: plan.estimatedCaloriesMax,
        studentSummary: plan.studentSummary,
        safetyNote: plan.safetyNote,
        notes: plan.notes,
        exercises: currentExercises,
      },
      null,
      2
    ),
    "",
    "BIBLIOTECA OFICIAL DISPONÍVEL:",
    JSON.stringify(availableExercises, null, 2),
    "",
    "MODELO OBRIGATÓRIO DA RESPOSTA:",
    JSON.stringify(requiredResponseExample, null, 2),
  ].join("\n");
}

function parseManualProposal(rawValue: unknown): {
  proposal?: AdjustmentProposal;
  error?: string;
} {
  const raw = cleanText(rawValue);

  if (!raw) {
    return { error: "Cole a resposta da IA antes de validar." };
  }

  let jsonText = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "A resposta precisa ser um objeto JSON válido." };
    }

    return { proposal: parsed as AdjustmentProposal };
  } catch {
    return {
      error:
        "A resposta não é um JSON válido. Peça à IA para devolver somente o JSON, sem explicações ou blocos de código.",
    };
  }
}

async function validateProposal(proposal: AdjustmentProposal) {
  if (!proposal || !Array.isArray(proposal.exercises) || proposal.exercises.length === 0) {
    return { error: "A proposta precisa conter ao menos um exercício." };
  }

  const requiredTextFields: Array<keyof AdjustmentProposal> = [
    "name",
    "description",
    "objective",
    "focusAreas",
    "intensity",
    "studentSummary",
    "safetyNote",
    "notes",
    "rationale",
    "studentMessage",
  ];

  const missingFields = requiredTextFields.filter(
    (field) => typeof proposal[field] !== "string"
  );

  if (missingFields.length > 0) {
    return {
      error: `A resposta está sem campos obrigatórios ou com formato incorreto: ${missingFields.join(
        ", "
      )}.`,
    };
  }

  const numericFields: Array<keyof AdjustmentProposal> = [
    "estimatedDurationMinutes",
    "estimatedCaloriesMin",
    "estimatedCaloriesMax",
  ];

  const invalidNumericFields = numericFields.filter(
    (field) => !Number.isFinite(Number(proposal[field])) || Number(proposal[field]) < 0
  );

  if (invalidNumericFields.length > 0) {
    return {
      error: `Os campos numéricos estão inválidos: ${invalidNumericFields.join(", ")}.`,
    };
  }

  const ids = proposal.exercises
    .map((exercise) => cleanId(exercise.exerciseId))
    .filter(Boolean) as string[];

  if (ids.length !== proposal.exercises.length) {
    return { error: "Todos os exercícios precisam ter exerciseId válido." };
  }

  const invalidExerciseFields = proposal.exercises.findIndex(
    (exercise) =>
      !Number.isFinite(Number(exercise.series)) ||
      Number(exercise.series) < 1 ||
      !Number.isFinite(Number(exercise.order)) ||
      typeof exercise.reps !== "string" ||
      typeof exercise.weight !== "string" ||
      typeof exercise.restTime !== "string" ||
      typeof exercise.notes !== "string"
  );

  if (invalidExerciseFields >= 0) {
    return {
      error: `O exercício ${invalidExerciseFields + 1} está com campos obrigatórios inválidos.`,
    };
  }

  const libraryExercises = (await prisma.exerciseLibrary.findMany({
    where: {
      id: { in: Array.from(new Set(ids)) },
      active: true,
    },
  })) as LibraryExerciseRecord[];

  const byId = new Map(libraryExercises.map((exercise) => [exercise.id, exercise]));
  const missing = ids.filter((id) => !byId.has(id));

  if (missing.length > 0) {
    return {
      error: `A proposta contém exercício inexistente ou inativo: ${Array.from(
        new Set(missing)
      ).join(", ")}.`,
    };
  }

  const normalizedExercises = proposal.exercises.map((exercise, index) => {
    const libraryExercise = byId.get(exercise.exerciseId)!;

    return {
      libraryExerciseId: libraryExercise.id,
      name: libraryExercise.name,
      description: libraryExercise.description,
      series: cleanPositiveInteger(exercise.series, 3) || 1,
      reps: cleanText(exercise.reps) || "10",
      weight: cleanText(exercise.weight) || null,
      restTime: cleanText(exercise.restTime) || "60s",
      notes: cleanText(exercise.notes) || null,
      order: Number.isFinite(Number(exercise.order)) ? Number(exercise.order) : index,
      imageUrl: libraryExercise.imageUrl || null,
      videoUrl: libraryExercise.videoUrl || null,
    };
  });

  return { normalizedExercises };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const userId = String(sessionUser.id);
    const role = normalizeRole(sessionUser.role);

    if (!["TEACHER", "GESTOR", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toUpperCase() as AdjustmentAction;
    const preferenceId = cleanId(body?.preferenceId);
    const workoutId = cleanId(body?.workoutId);

    if (
      !preferenceId ||
      !["PREPARE_PROMPT", "VALIDATE_MANUAL", "APPLY", "FUTURE_ONLY"].includes(
        action
      )
    ) {
      return NextResponse.json({ error: "Dados do ajuste inválidos." }, { status: 400 });
    }

    const contextResult = await getAdjustmentContext({
      preferenceId,
      workoutId,
      userId,
      role,
      requireWorkout: action !== "FUTURE_ONLY",
    });

    if ("error" in contextResult) {
      return NextResponse.json(
        { error: contextResult.error },
        { status: contextResult.status }
      );
    }

    const context = contextResult;

    if (action === "FUTURE_ONLY") {
      const now = new Date();
      const replyContent = [
        `${context.preference.student.name}, registrei sua preferência: ${context.preference.summary}`,
        context.workout
          ? "Ela será considerada nos próximos treinos. O treino que já está disponível nesta semana será mantido como está."
          : "Ela será considerada na montagem dos próximos treinos.",
        "Mensagem automática enviada após a decisão do professor.",
      ].join("\n\n");

      await prisma.$transaction([
        prisma.studentTrainingPreference.update({
          where: { id: preferenceId },
          data: {
            currentWeekAction: "FUTURE_ONLY",
            handledAt: now,
            handledById: userId,
          },
        }),
        prisma.question.create({
          data: {
            content: replyContent,
            answer: replyContent,
            answeredAt: now,
            answeredById: userId,
            parentId: context.preference.sourceConversationId,
            studentId: context.preference.studentId,
            teacherId:
              context.preference.professorId || context.preference.student.userId,
            senderRole: role === "TEACHER" ? "TEACHER" : "GESTOR",
          },
        }),
      ]);

      return NextResponse.json({
        ok: true,
        action: "FUTURE_ONLY",
        message:
          "Preferência registrada para os próximos treinos. O treino atual foi mantido.",
      });
    }

    if (!context.workout || !context.workout.workoutPlan) {
      return NextResponse.json(
        { error: "Treino pendente não localizado para esta ação." },
        { status: 409 }
      );
    }

    if (action === "PREPARE_PROMPT") {
      const library = await prisma.exerciseLibrary.findMany({
        where: { active: true },
        orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
        take: 300,
      });

      if (library.length === 0) {
        return NextResponse.json(
          {
            error:
              "A biblioteca oficial está vazia. Cadastre exercícios antes de preparar a adaptação.",
          },
          { status: 409 }
        );
      }

      const manualPrompt = buildAdjustmentPrompt({ context, library });

      return NextResponse.json({
        ok: true,
        manualPrompt,
        currentWorkout: {
          id: context.workout.id,
          date: context.workout.date.toISOString(),
          status: context.workout.status,
          plan: {
            id: context.workout.workoutPlan.id,
            name: context.workout.workoutPlan.name,
            exercises: context.workout.workoutPlan.exercises.map((exercise: any) => ({
              exerciseId: exercise.libraryExerciseId,
              name: exercise.name,
              series: exercise.series,
              reps: exercise.reps,
            })),
          },
        },
        message:
          "Prompt preparado. Copie para a IA, cole a resposta JSON no sistema e valide antes de aplicar.",
      });
    }

    if (action === "VALIDATE_MANUAL") {
      const parsed = parseManualProposal(body?.manualResponse);

      if (parsed.error || !parsed.proposal) {
        return NextResponse.json(
          { error: parsed.error || "Resposta manual inválida." },
          { status: 422 }
        );
      }

      const validation = await validateProposal(parsed.proposal);

      if (validation.error || !validation.normalizedExercises) {
        return NextResponse.json(
          { error: validation.error || "Proposta inválida." },
          { status: 422 }
        );
      }

      const proposalWithNames = {
        ...parsed.proposal,
        exercises: parsed.proposal.exercises.map((exercise, index) => ({
          ...exercise,
          exerciseName:
            validation.normalizedExercises?.[index]?.name ||
            "Exercício da biblioteca",
        })),
      };

      return NextResponse.json({
        ok: true,
        proposal: proposalWithNames,
        message:
          "Resposta validada. Revise a proposta antes de substituir o treino pendente.",
      });
    }

    const proposal = body?.proposal as AdjustmentProposal;
    const validation = await validateProposal(proposal);

    if (validation.error || !validation.normalizedExercises) {
      return NextResponse.json(
        { error: validation.error || "Proposta inválida." },
        { status: 422 }
      );
    }

    const plan = context.workout.workoutPlan;
    const now = new Date();
    const studentMessage = cleanText(proposal.studentMessage) ||
      [
        `${context.preference.student.name}, sua preferência foi considerada na revisão do treino desta semana.`,
        "O treino pendente foi ajustado e já está disponível para você.",
        "Mensagem automática enviada após a revisão do professor.",
      ].join("\n\n");

    await prisma.$transaction(async (tx) => {
      const adaptedPlan = await tx.workoutPlan.create({
        data: {
          studentId: plan.studentId,
          name: cleanText(proposal.name) || plan.name,
          description: cleanText(proposal.description) || null,
          active: true,
          date: plan.date || context.workout.date,
          objective: cleanText(proposal.objective) || plan.objective,
          focusAreas: cleanText(proposal.focusAreas) || null,
          intensity: cleanText(proposal.intensity) || null,
          estimatedDurationMinutes:
            cleanPositiveInteger(
              proposal.estimatedDurationMinutes,
              plan.estimatedDurationMinutes || 0
            ) || null,
          estimatedCaloriesMin:
            cleanPositiveInteger(
              proposal.estimatedCaloriesMin,
              plan.estimatedCaloriesMin || 0
            ) || null,
          estimatedCaloriesMax:
            cleanPositiveInteger(
              proposal.estimatedCaloriesMax,
              plan.estimatedCaloriesMax || 0
            ) || null,
          studentSummary: cleanText(proposal.studentSummary) || null,
          safetyNote: cleanText(proposal.safetyNote) || null,
          contractId: plan.contractId || context.workout.contractId || null,
          notes: [
            cleanText(proposal.notes),
            `Ajustado após preferência registrada no chat: ${context.preference.summary}`,
            `Justificativa da sugestão revisada: ${cleanText(proposal.rationale)}`,
            `Plano anterior preservado para histórico: ${plan.id}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      });

      await tx.exercise.createMany({
        data: validation.normalizedExercises.map((exercise) => ({
          workoutPlanId: adaptedPlan.id,
          ...exercise,
        })),
      });

      await tx.workout.update({
        where: { id: context.workout.id },
        data: {
          workoutPlanId: adaptedPlan.id,
          notes: [
            cleanText(context.workout.notes),
            `Treino adaptado após preferência registrada no chat em ${now.toISOString()}.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      });

      if (plan.workouts.length === 1 && plan.workouts[0]?.id === context.workout.id) {
        await tx.workoutPlan.update({
          where: { id: plan.id },
          data: { active: false },
        });
      }

      await tx.studentTrainingPreference.update({
        where: { id: preferenceId },
        data: {
          currentWeekAction: "ADAPTED",
          relatedWorkoutId: context.workout.id,
          relatedWorkoutPlanId: adaptedPlan.id,
          handledAt: now,
          handledById: userId,
        },
      });

      await tx.question.create({
        data: {
          content: studentMessage,
          answer: studentMessage,
          answeredAt: now,
          answeredById: userId,
          parentId: context.preference.sourceConversationId,
          studentId: context.preference.studentId,
          teacherId:
            context.preference.professorId || context.preference.student.userId,
          senderRole: role === "TEACHER" ? "TEACHER" : "GESTOR",
        },
      });
    });

    return NextResponse.json({
      ok: true,
      action: "ADAPTED",
      message:
        "Treino pendente ajustado. O treino concluído permaneceu intacto.",
    });
  } catch (error) {
    console.error("POST /api/workout-adjustments error:", error);
    return NextResponse.json(
      { error: "Erro ao processar o ajuste do treino." },
      { status: 500 }
    );
  }
}
