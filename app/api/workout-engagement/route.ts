import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { getStudentTechnicalContext } from "@/lib/student-technical-memory";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";


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

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "FV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function buildSenderAvatarHtml(name: string, image?: string | null): string {
  const safeName = escapeHtml(name);
  const safeImage =
    image && /^https?:\/\//i.test(image) ? escapeHtml(image) : "";

  if (safeImage) {
    return `<img src="${safeImage}" alt="${safeName}" width="52" height="52" style="display:block; width:52px; height:52px; border-radius:999px; object-fit:cover; border:2px solid #00A19C;" />`;
  }

  return `<div style="width:52px; height:52px; border-radius:999px; background:#2a2119; border:2px solid #00A19C; color:#00A19C; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:17px;">${escapeHtml(
    getInitials(name)
  )}</div>`;
}

async function sendWorkoutAdjustmentEmail({
  to,
  studentName,
  professorName,
  professorImage,
  workoutName,
  workoutDate,
  objective,
  studentMessage,
}: {
  to: string | null;
  studentName: string;
  professorName: string;
  professorImage?: string | null;
  workoutName: string;
  workoutDate: Date;
  objective: string;
  studentMessage: string;
}): Promise<boolean> {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeProfessorName = escapeHtml(professorName);
  const safeWorkoutName = escapeHtml(workoutName);
  const safeWorkoutDate = escapeHtml(formatDatePtBr(workoutDate));
  const safeObjective = escapeHtml(objective);
  const safeStudentMessage = escapeHtml(studentMessage).replaceAll("\n", "<br />");
  const avatarHtml = buildSenderAvatarHtml(professorName, professorImage);
  const subject = `${professorName}: seu treino foi ajustado`;

  const text = [
    `Oi, ${studentName}!`,
    "",
    studentMessage,
    "",
    `Treino atualizado: ${workoutName}`,
    `Data: ${formatDatePtBr(workoutDate)}`,
    objective ? `Objetivo: ${objective}` : "",
    "",
    "Acesse sua área do aluno para conferir os exercícios, séries, repetições e orientações atualizadas.",
    `Acessar treino: ${alunoUrl}`,
    "",
    "Caso queira comentar como foi a adaptação ou tenha alguma dúvida, use o chat da plataforma.",
    "",
    professorName,
    "Professor · Funcional UP Digital",
    "Mensagem automática enviada após a revisão e confirmação do professor.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:580px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:18px; overflow:hidden;">
        <div style="padding:22px 24px; border-bottom:1px solid #2a2a2a; display:flex; align-items:center; gap:14px;">
          ${avatarHtml}
          <div>
            <div style="color:#f5f5f5; font-size:16px; font-weight:bold; line-height:1.3;">${safeProfessorName}</div>
            <div style="color:#00A19C; font-size:12px; margin-top:3px;">Professor · Funcional UP Digital</div>
          </div>
        </div>

        <div style="padding:24px;">
          <h2 style="color:#00A19C; margin:0 0 16px; font-size:22px;">Seu treino foi ajustado</h2>

          <p style="color:#f5f5f5; font-size:15px; line-height:1.6;">
            Oi, <strong>${safeStudentName}</strong>!
          </p>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.7;">
            ${safeStudentMessage}
          </p>

          <div style="background:#071413; border:1px solid #005D5A; border-radius:12px; padding:16px; margin:18px 0;">
            <div style="color:#00A19C; font-size:12px; font-weight:bold; text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px;">Treino atualizado</div>
            <div style="color:#f5f5f5; font-size:16px; font-weight:bold; line-height:1.4;">${safeWorkoutName}</div>
            <div style="color:#b8b8b8; font-size:13px; margin-top:6px;">Data: ${safeWorkoutDate}</div>
            ${
              safeObjective
                ? `<div style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:8px;">Objetivo: ${safeObjective}</div>`
                : ""
            }
          </div>

          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Acesse sua área para conferir os exercícios, séries, repetições e orientações atualizadas antes de iniciar.
          </p>

          <a href="${alunoUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:4px;">
            Ver treino atualizado
          </a>

          <p style="color:#d4d4d4; font-size:13px; line-height:1.6; margin-top:22px;">
            Caso queira comentar como foi a adaptação ou tenha alguma dúvida, use o chat da plataforma.
          </p>

          <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:20px;">
            ${safeProfessorName}<br />Professor · Funcional UP Digital
          </p>

          <p style="color:#6b6b6b; font-size:11px; line-height:1.5; margin-top:4px;">
            Mensagem automática enviada após a revisão e confirmação do professor.
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmail({ to, subject, text, html });

  return true;
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
          email: true,
          userAuth: {
            select: {
              birthDate: true,
              email: true,
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
      technicalContext: null,
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

  const [activePreferences, technicalContext] = await Promise.all([prisma.studentTrainingPreference.findMany({
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
  }), getStudentTechnicalContext(preference.studentId)]);

  return {
    preference,
    workout,
    activePreferences,
    technicalContext,
  };
}


function normalizeSearchText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function selectRelevantLibraryExercises({
  context,
  library,
  currentExerciseIds,
}: {
  context: any;
  library: any[];
  currentExerciseIds: string[];
}): any[] {
  const preferenceText = normalizeSearchText(
    [
      context.preference?.summary,
      context.preference?.originalMessage,
      ...(context.activePreferences || []).flatMap((item: any) => [
        item?.summary,
        item?.originalMessage,
      ]),
      context.workout?.workoutPlan?.name,
      context.workout?.workoutPlan?.description,
      context.workout?.workoutPlan?.objective,
      context.workout?.workoutPlan?.focusAreas,
    ].join(" ")
  );

  const currentIds = new Set(currentExerciseIds.filter(Boolean));
  const importantTerms = Array.from(
    new Set(
      preferenceText
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 4)
        .filter(
          (term) =>
            ![
              "treino",
              "aluno",
              "preferencia",
              "geral",
              "fazer",
              "gostaria",
              "objetivo",
              "fortalecer",
              "mais",
              "para",
              "pela",
              "como",
              "moderada",
              "intenso",
              "intensos",
            ].includes(term)
        )
    )
  );

  const thematicBoosts: string[] = [];
  if (preferenceText.includes("corrida")) {
    thematicBoosts.push(
      "corrida",
      "pernas",
      "gluteos",
      "panturrilha",
      "quadril",
      "tornozelo",
      "core",
      "unilateral"
    );
  }
  if (preferenceText.includes("agachamento")) thematicBoosts.push("agachamento");
  if (preferenceText.includes("bulgar")) thematicBoosts.push("bulgar", "afundo");
  if (preferenceText.includes("academia")) thematicBoosts.push("academia");
  if (preferenceText.includes("casa")) thematicBoosts.push("casa", "nenhum equipamento");

  const scored = library.map((exercise, index) => {
    const searchable = normalizeSearchText(
      [
        exercise.name,
        exercise.muscleGroup,
        exercise.objectiveTags,
        exercise.locationTags,
        exercise.equipmentTags,
        exercise.levelTags,
        exercise.intensity,
      ].join(" ")
    );

    let score = currentIds.has(exercise.id) ? 1000 : 0;

    for (const term of importantTerms) {
      if (searchable.includes(term)) score += term.length >= 7 ? 8 : 5;
    }

    for (const term of thematicBoosts) {
      if (searchable.includes(term)) score += 12;
    }

    if (preferenceText.includes("corrida") && /pernas|gluteos|core|mobilidade/.test(searchable)) {
      score += 8;
    }

    return { exercise, score, index };
  });

  const currentExercises = library.filter((exercise) => currentIds.has(exercise.id));
  const currentLibraryIds = new Set(currentExercises.map((exercise) => exercise.id));

  const alternatives = scored
    .filter((item) => item.score > 0 && !currentLibraryIds.has(item.exercise.id))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, 16 - currentExercises.length))
    .map((item) => item.exercise);

  return [...currentExercises, ...alternatives].slice(0, 16);
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
    order: exercise.order,
  }));

  const relevantLibrary = selectRelevantLibraryExercises({
    context,
    library,
    currentExerciseIds: currentExercises
      .map((exercise: any) => exercise.exerciseId)
      .filter(Boolean),
  });

  const availableExercises = relevantLibrary.map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
  }));

  const technicalContext = context.technicalContext || {};
  const adherence = technicalContext.adherence || {};
  const exerciseHistory = technicalContext.exerciseHistory || {};

  const preferences = (context.activePreferences || [])
    .map((item: any) => cleanText(item.originalMessage || item.summary))
    .filter(Boolean)
    .slice(0, 8);

  const easy = (exerciseHistory.easy || []).map((item: any) =>
    `${item.exerciseName}${item.count ? ` (${item.count}x)` : ""}`
  );
  const difficult = (exerciseHistory.difficult || []).map((item: any) =>
    `${item.exerciseName}${item.count ? ` (${item.count}x)` : ""}`
  );
  const skipped = (exerciseHistory.skipped || []).map((item: any) => {
    const reasons = Array.isArray(item.reasons) ? item.reasons.join(", ") : "";
    return `${item.exerciseName}${reasons ? `: ${reasons}` : ""}`;
  });
  const care = (technicalContext.openCareEvents || [])
    .map((item: any) =>
      cleanText(`${item.title || ""}${item.description ? `: ${item.description}` : ""}`).slice(0, 280)
    )
    .filter(Boolean)
    .slice(0, 5);
  const approvedMemory = (technicalContext.approvedTechnicalMemory || [])
    .map((item: any) => cleanText(item.summary || item.content || item.description).slice(0, 280))
    .filter(Boolean)
    .slice(0, 8);

  const historySummary = {
    adherence: cleanText(adherence.summary) || "Sem resumo de adesão.",
    easy,
    difficult,
    skipped,
    care,
    approvedMemory,
  };

  const currentWorkout = {
    name: plan.name,
    objective: plan.objective,
    focusAreas: plan.focusAreas,
    intensity: plan.intensity,
    estimatedDurationMinutes: plan.estimatedDurationMinutes,
    estimatedCaloriesMin: plan.estimatedCaloriesMin,
    estimatedCaloriesMax: plan.estimatedCaloriesMax,
    exercises: currentExercises,
  };

  return [
    ...MANUAL_AI_EXECUTION_HEADER_LINES,
    "Adapte apenas o treino pendente abaixo para apoiar o professor.",
    "Responda somente com um objeto JSON válido, sem markdown ou explicações.",
    "Use somente exerciseId da biblioteca fornecida. Não invente exercícios, cargas, restrições, lesões, equipamentos ou diagnósticos.",
    "Mantenha data e objetivo geral. Respeite preferências, histórico e eventos de cuidado. Um relato isolado pede cautela, não progressão automática.",
    "Exercício difícil ou não realizado deve ser simplificado ou substituído. Dor/desconforto exige revisão humana.",
    "A proposta será revisada pelo professor antes de ser aplicada.",
    "",
    `ALUNO: ${context.preference.student.name}`,
    `DATA: ${context.workout.date.toISOString().slice(0, 10)}`,
    `PREFERÊNCIA PRINCIPAL: ${cleanText(context.preference.originalMessage || context.preference.summary)}`,
    `PREFERÊNCIAS ATIVAS: ${JSON.stringify(preferences)}`,
    `HISTÓRICO RESUMIDO: ${JSON.stringify(historySummary)}`,
    `TREINO ATUAL: ${JSON.stringify(currentWorkout)}`,
    `BIBLIOTECA PERMITIDA: ${JSON.stringify(availableExercises)}`,
    "",
    "CAMPOS OBRIGATÓRIOS NO JSON:",
    "name, description, objective, focusAreas, intensity, estimatedDurationMinutes, estimatedCaloriesMin, estimatedCaloriesMax, studentSummary, safetyNote, notes, rationale, studentMessage, exercises.",
    "Cada item de exercises deve conter: exerciseId, series, reps, weight, restTime, notes, order.",
    "estimatedDurationMinutes, estimatedCaloriesMin, estimatedCaloriesMax, series e order devem ser números.",
    "studentMessage deve informar de forma humana que o treino pendente foi ajustado após revisão do professor.",
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

    const professorId =
      context.preference.professorId || (role === "TEACHER" ? userId : null);
    const professor = professorId
      ? await prisma.user.findUnique({
          where: { id: professorId },
          select: {
            name: true,
            image: true,
          },
        })
      : null;
    const professorName =
      cleanText(professor?.name) ||
      (role === "TEACHER" ? cleanText(sessionUser.name) : "Equipe Funcional UP Digital");
    const professorImage = professor?.image || null;
    const studentEmail =
      cleanText(context.preference.student.email) ||
      cleanText(context.preference.student.userAuth?.email) ||
      null;

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

    let emailSent = false;
    let emailStatus: "SENT" | "NO_EMAIL" | "FAILED" = studentEmail
      ? "FAILED"
      : "NO_EMAIL";

    if (studentEmail) {
      try {
        emailSent = await sendWorkoutAdjustmentEmail({
          to: studentEmail,
          studentName: context.preference.student.name,
          professorName,
          professorImage,
          workoutName: cleanText(proposal.name) || plan.name,
          workoutDate: context.workout.date,
          objective: cleanText(proposal.objective) || cleanText(plan.objective),
          studentMessage,
        });
        emailStatus = emailSent ? "SENT" : "FAILED";
      } catch (emailError) {
        console.error(
          "Falha ao enviar e-mail de treino ajustado ao aluno:",
          emailError
        );
        emailStatus = "FAILED";
      }
    }

    const responseMessage =
      emailStatus === "SENT"
        ? "Treino pendente ajustado. O treino concluído permaneceu intacto e o aluno foi avisado no chat e por e-mail."
        : emailStatus === "NO_EMAIL"
          ? "Treino pendente ajustado e aviso registrado no chat. O aluno não possui e-mail cadastrado para receber a notificação."
          : "Treino pendente ajustado e aviso registrado no chat, mas não foi possível enviar o e-mail neste momento.";

    return NextResponse.json({
      ok: true,
      action: "ADAPTED",
      emailSent,
      emailStatus,
      message: responseMessage,
    });
  } catch (error) {
    console.error("POST /api/workout-adjustments error:", error);
    return NextResponse.json(
      { error: "Erro ao processar o ajuste do treino." },
      { status: 500 }
    );
  }
}
