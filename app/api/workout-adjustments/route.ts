import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { getStudentTechnicalContext } from "@/lib/student-technical-memory";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";
import JSZip from "jszip";


type AdjustmentAction =
  | "PREPARE_PROMPT"
  | "PREPARE_PACKAGE"
  | "VALIDATE_MANUAL"
  | "APPLY"
  | "FUTURE_ONLY"
  | "PREPARE_CONVERSATION_PACKAGE"
  | "VALIDATE_CONVERSATION_BATCH"
  | "APPLY_CONVERSATION_BATCH";

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



type BatchAdjustmentProposal = {
  rationale: string;
  studentMessage: string;
  workouts: Array<AdjustmentProposal & { workoutId: string }>;
};

async function getConversationBatchContext({
  conversationId,
  userId,
  role,
}: {
  conversationId: string;
  userId: string;
  role: string;
}) {
  const conversation = await prisma.question.findUnique({
    where: { id: conversationId },
    include: {
      student: {
        select: {
          id: true, name: true, email: true, userId: true, notes: true,
          userAuth: { select: { email: true, birthDate: true } },
        },
      },
      children: { orderBy: { createdAt: "asc" }, select: { content: true, senderRole: true, createdAt: true } },
    },
  });
  if (!conversation?.student) return { error: "Conversa ou aluno não localizado.", status: 404 as const };
  if (role === "TEACHER" && conversation.teacherId && conversation.teacherId !== userId && conversation.student.userId !== userId) {
    return { error: "Você não tem permissão para adaptar os treinos deste aluno.", status: 403 as const };
  }

  const today = new Date(); today.setHours(0,0,0,0);
  // A adaptação deve considerar TODOS os treinos pendentes da semana atual,
  // inclusive os que ficaram para trás dentro da mesma semana, além dos futuros.
  const weekStart = new Date(today);
  const weekDay = weekStart.getDay();
  const daysSinceMonday = weekDay === 0 ? 6 : weekDay - 1;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);

  const workouts = await prisma.workout.findMany({
    where: { studentId: conversation.student.id, status: "PENDENTE", date: { gte: weekStart }, workoutPlanId: { not: null } },
    orderBy: { date: "asc" },
    include: { workoutPlan: { include: { exercises: { orderBy: { order: "asc" } } } } },
  });
  const eligible = [] as typeof workouts;
  for (const workout of workouts) {
    if (!workout.workoutPlan) continue;
    const dayStart = new Date(workout.date); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
    const started = await prisma.workoutExerciseProgress.count({
      where: { studentId: conversation.student.id, workoutPlanId: workout.workoutPlan.id, workoutDate: { gte: dayStart, lt: dayEnd }, status: { not: "PENDENTE" } },
    });
    if (started === 0) eligible.push(workout);
  }
  const technicalContext = await getStudentTechnicalContext(conversation.student.id);
  const openCareEvents = await prisma.studentCareEvent.findMany({
    where: { studentId: conversation.student.id, status: "ABERTO" },
    orderBy: { createdAt: "desc" },
    select: { id: true, eventType: true, severity: true, title: true, description: true },
  });
  return { conversation, student: conversation.student, workouts: eligible, technicalContext, openCareEvents };
}

function parseBatchProposal(rawValue: unknown): { proposal?: BatchAdjustmentProposal; error?: string } {
  let parsed: unknown;

  if (typeof rawValue === "string") {
    const raw = rawValue.trim();

    if (!raw) {
      return { error: "Cole a resposta da IA antes de validar." };
    }

    let jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const first = jsonText.indexOf("{");
    const last = jsonText.lastIndexOf("}");

    if (first >= 0 && last > first) {
      jsonText = jsonText.slice(first, last + 1);
    }

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { error: "A resposta da IA não contém JSON válido." };
    }
  } else if (rawValue && typeof rawValue === "object") {
    // Na validação, a proposta chega como texto. Na aplicação, o front-end
    // devolve a proposta já convertida em objeto. Os dois formatos precisam
    // ser aceitos para que a confirmação grave as alterações no banco.
    parsed = rawValue;
  } else {
    return { error: "Cole a resposta da IA antes de validar." };
  }

  const candidate = parsed as Partial<BatchAdjustmentProposal> | null;

  if (
    !candidate ||
    !Array.isArray(candidate.workouts) ||
    candidate.workouts.length === 0
  ) {
    return {
      error: "A resposta precisa conter o campo workouts com ao menos um treino.",
    };
  }

  if (
    typeof candidate.rationale !== "string" ||
    typeof candidate.studentMessage !== "string"
  ) {
    return { error: "A resposta precisa conter rationale e studentMessage." };
  }

  return { proposal: candidate as BatchAdjustmentProposal };
}

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
    .slice(0, Math.max(0, 20 - currentExercises.length))
    .map((item) => item.exercise);

  return [...currentExercises, ...alternatives].slice(0, 20);
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
  const exerciseHistory = technicalContext.exerciseSignals || technicalContext.exerciseHistory || {};

  const preferences = (context.activePreferences || [])
    .map((item: any) => cleanText(item.originalMessage || item.summary))
    .filter(Boolean);

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
      cleanText(`${item.title || ""}${item.description ? `: ${item.description}` : ""}`)
    )
    .filter(Boolean);
  const approvedMemory = (technicalContext.approvedMemories || technicalContext.approvedTechnicalMemory || [])
    .map((item: any) => cleanText(item.summary || item.content || item.description))
    .filter(Boolean);

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
    description: plan.description,
    objective: plan.objective,
    focusAreas: plan.focusAreas,
    intensity: plan.intensity,
    estimatedDurationMinutes: plan.estimatedDurationMinutes,
    estimatedCaloriesMin: plan.estimatedCaloriesMin,
    estimatedCaloriesMax: plan.estimatedCaloriesMax,
    studentSummary: plan.studentSummary,
    safetyNote: plan.safetyNote,
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
    const conversationId = cleanId(body?.conversationId);

    if (["PREPARE_CONVERSATION_PACKAGE", "VALIDATE_CONVERSATION_BATCH", "APPLY_CONVERSATION_BATCH"].includes(action)) {
      if (!conversationId) return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
      const batchContext = await getConversationBatchContext({ conversationId, userId, role });
      if ("error" in batchContext) return NextResponse.json({ error: batchContext.error }, { status: batchContext.status });

      if (action === "PREPARE_CONVERSATION_PACKAGE") {
        if (batchContext.workouts.length === 0) return NextResponse.json({ error: "Não há treinos pendentes ou futuros elegíveis para adaptação." }, { status: 409 });
        const library = await prisma.exerciseLibrary.findMany({ where: { active: true }, orderBy: { name: "asc" } });
        const history = [
          { role: batchContext.conversation.senderRole, content: batchContext.conversation.content, createdAt: batchContext.conversation.createdAt },
          ...batchContext.conversation.children,
        ];
        const workoutPayload = batchContext.workouts.map((workout: any) => ({
          workoutId: workout.id, date: workout.date.toISOString().slice(0,10), status: workout.status,
          plan: {
            name: workout.workoutPlan?.name, description: workout.workoutPlan?.description, objective: workout.workoutPlan?.objective,
            focusAreas: workout.workoutPlan?.focusAreas, intensity: workout.workoutPlan?.intensity,
            estimatedDurationMinutes: workout.workoutPlan?.estimatedDurationMinutes,
            exercises: workout.workoutPlan?.exercises.map((exercise: any) => ({ exerciseId: exercise.libraryExerciseId, name: exercise.name, series: exercise.series, reps: exercise.reps, weight: exercise.weight, restTime: exercise.restTime, notes: exercise.notes, order: exercise.order })),
          },
        }));
        const model = { rationale: "", studentMessage: "", workouts: workoutPayload.map((w: any) => ({ workoutId: w.workoutId, name: w.plan.name || "", description: w.plan.description || "", objective: w.plan.objective || "", focusAreas: w.plan.focusAreas || "", intensity: w.plan.intensity || "", estimatedDurationMinutes: w.plan.estimatedDurationMinutes || 0, estimatedCaloriesMin: 0, estimatedCaloriesMax: 0, studentSummary: "", safetyNote: "", notes: "", rationale: "", studentMessage: "", exercises: [] })) };
        const prompt = [
          ...MANUAL_AI_EXECUTION_HEADER_LINES,
          "Adapte TODOS os treinos elegíveis listados neste pacote com base no relato do aluno e em todo o contexto.",
          "Responda somente com JSON válido no formato de MODELO_RESPOSTA.json.",
          "Use somente exerciseId da biblioteca permitida. Não invente exercícios, cargas, lesões, restrições, equipamentos ou diagnósticos.",
          "REGRA IMUTÁVEL DE IDENTIFICAÇÃO: cada workoutId devolvido deve ser copiado exatamente de CONTEXTO/TREINOS_ELEGIVEIS.json.",
          `WorkoutId elegíveis obrigatórios: ${workoutPayload.map((w:any)=>w.workoutId).join(", ")}`,
          "Não use ALL_PENDING_AND_FUTURE, ALL, CURRENT_WEEK, nomes de treino, datas ou qualquer código genérico no campo workoutId.",
          "A quantidade de itens em workouts deve ser exatamente igual à quantidade de treinos elegíveis, sem omissões e sem duplicidades.",
          "Mesmo quando a mudança for apenas de equipamento, preferência ou contexto, devolva cada treino elegível completo usando seu workoutId real.",
          "Não altere treinos concluídos, vencidos ou já iniciados. Preserve as datas e workoutId exatamente como fornecidos.",
          "Se houver evento de cuidado aberto, gere apenas o rascunho; a publicação ficará bloqueada até a resolução pelo professor.",
          "studentMessage deve explicar de forma humana que os próximos treinos foram revisados com base no relato do aluno.",
          "Cada item de workouts deve conter todos os campos do treino e exercises completos.",
        ].join("\n");
        const zip = new JSZip();
        zip.file("LEIA_PRIMEIRO.txt", prompt);
        zip.file("MODELO_RESPOSTA.json", JSON.stringify(model, null, 2));
        zip.file("CONTEXTO/CONVERSA.json", JSON.stringify(history, null, 2));
        zip.file("CONTEXTO/MEMORIA_TECNICA.json", JSON.stringify(batchContext.technicalContext || {}, null, 2));
        zip.file("CONTEXTO/EVENTOS_DE_CUIDADO.json", JSON.stringify(batchContext.openCareEvents, null, 2));
        zip.file("CONTEXTO/TREINOS_ELEGIVEIS.json", JSON.stringify(workoutPayload, null, 2));
        zip.file("CONTEXTO/BIBLIOTECA_EXERCICIOS.json", JSON.stringify(library.map((e:any)=>({ exerciseId:e.id,name:e.name,group:e.muscleGroup,location:e.locationTags,equipment:e.equipmentTags,intensity:e.intensity })), null, 2));
        zip.file("manifesto.json", JSON.stringify({ packageType: "WORKOUT_ADJUSTMENT_FROM_CONVERSATION", conversationId, studentId: batchContext.student.id, studentName: batchContext.student.name, eligibleWorkoutIds: workoutPayload.map((w:any)=>w.workoutId), eligibleWorkoutDates: workoutPayload.map((w:any)=>w.date), openCareEventCount: batchContext.openCareEvents.length, generatedAt: new Date().toISOString() }, null, 2));
        const output = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const eligibleWorkoutDetails = workoutPayload.map((workout:any) => ({
          workoutId: workout.workoutId,
          name: workout.plan?.name || "Treino pendente",
          date: workout.date,
          status: workout.status,
        }));
        return new NextResponse(output, {
          status: 200,
          headers: {
            "Content-Type":"application/zip",
            "Content-Disposition": `attachment; filename="pacote-alterar-treinos-${batchContext.student.name.toLowerCase().replace(/[^a-z0-9]+/gi,"-")}.zip"`,
            "Cache-Control":"no-store",
            "X-Eligible-Workout-Count": String(workoutPayload.length),
            "X-Eligible-Workout-Details": encodeURIComponent(JSON.stringify(eligibleWorkoutDetails)),
          },
        });
      }

      const parsedBatch = parseBatchProposal(body?.manualResponse || body?.proposal);
      if (parsedBatch.error || !parsedBatch.proposal) return NextResponse.json({ error: parsedBatch.error || "Resposta inválida." }, { status: 422 });
      const eligibleIds = new Set(batchContext.workouts.map((w:any)=>w.id));
      const returnedIds = parsedBatch.proposal.workouts.map((w:any)=>cleanId(w.workoutId));
      if (returnedIds.some((id:any)=>!id || !eligibleIds.has(id))) return NextResponse.json({ error: "A IA retornou treino que não está entre os elegíveis." }, { status: 422 });
      if (new Set(returnedIds).size !== eligibleIds.size || returnedIds.length !== eligibleIds.size) return NextResponse.json({ error: "A resposta precisa adaptar todos os treinos elegíveis do pacote, sem omissões ou duplicidades." }, { status: 422 });
      const normalizedWorkouts:any[] = [];
      for (const item of parsedBatch.proposal.workouts) {
        const validation = await validateProposal(item);
        if (validation.error || !validation.normalizedExercises) return NextResponse.json({ error: `Treino ${item.workoutId}: ${validation.error || "proposta inválida"}` }, { status: 422 });
        normalizedWorkouts.push({ ...item, exercises: item.exercises.map((ex:any,index:number)=>({ ...ex, exerciseName: validation.normalizedExercises?.[index]?.name || "Exercício da biblioteca" })), _normalizedExercises: validation.normalizedExercises });
      }
      const normalizedBatch = { ...parsedBatch.proposal, workouts: normalizedWorkouts };
      if (action === "VALIDATE_CONVERSATION_BATCH") {
        return NextResponse.json({
          ok:true,
          proposal: normalizedBatch,
          eligibleWorkoutCount: batchContext.workouts.length,
          eligibleWorkouts: batchContext.workouts.map((workout:any) => ({
            workoutId: workout.id,
            name: workout.workoutPlan?.name || "Treino pendente",
            date: workout.date.toISOString(),
            status: workout.status,
          })),
          openCareEvents: batchContext.openCareEvents,
          message: `Resposta validada para ${batchContext.workouts.length} treino(s). Revise antes de aplicar.`,
        });
      }

      if (batchContext.openCareEvents.length > 0) return NextResponse.json({ error: "Há evento de cuidado aberto. A adaptação foi preparada, mas a publicação permanece bloqueada até a resolução do evento." }, { status: 409 });
      const now = new Date();
      const byWorkoutId = new Map(batchContext.workouts.map((w:any)=>[w.id,w]));
      await prisma.$transaction(async (tx) => {
        for (const item of normalizedWorkouts) {
          const workout:any = byWorkoutId.get(item.workoutId);
          const oldPlan = workout.workoutPlan;
          const newPlan = await tx.workoutPlan.create({ data: { studentId: oldPlan.studentId, name: cleanText(item.name)||oldPlan.name, description: cleanText(item.description)||null, active:true, date: oldPlan.date||workout.date, objective:cleanText(item.objective)||oldPlan.objective, focusAreas:cleanText(item.focusAreas)||null, intensity:cleanText(item.intensity)||null, estimatedDurationMinutes:cleanPositiveInteger(item.estimatedDurationMinutes,oldPlan.estimatedDurationMinutes||0)||null, estimatedCaloriesMin:cleanPositiveInteger(item.estimatedCaloriesMin,oldPlan.estimatedCaloriesMin||0)||null, estimatedCaloriesMax:cleanPositiveInteger(item.estimatedCaloriesMax,oldPlan.estimatedCaloriesMax||0)||null, studentSummary:cleanText(item.studentSummary)||null, safetyNote:cleanText(item.safetyNote)||null, contractId:oldPlan.contractId||workout.contractId||null, notes:[cleanText(item.notes),`Adaptado a partir da conversa ${conversationId}.`,`Plano anterior preservado: ${oldPlan.id}`].filter(Boolean).join("\n\n") } });
          await tx.exercise.createMany({ data: item._normalizedExercises.map((exercise:any)=>({ workoutPlanId:newPlan.id, ...exercise })) });
          await tx.workout.update({ where:{id:workout.id}, data:{workoutPlanId:newPlan.id, notes:[cleanText(workout.notes),`Treino adaptado em ${now.toISOString()} a partir do relato no chat.`].filter(Boolean).join("\n\n")} });
        }
        await tx.question.create({ data:{ content:cleanText(normalizedBatch.studentMessage), answer:cleanText(normalizedBatch.studentMessage), answeredAt:now, answeredById:userId, parentId:conversationId, studentId:batchContext.student.id, teacherId:batchContext.conversation.teacherId||batchContext.student.userId, senderRole:role==="TEACHER"?"TEACHER":"GESTOR" } });
      });
      const studentEmail = cleanText(batchContext.student.email)||cleanText(batchContext.student.userAuth?.email)||null;
      if (studentEmail) { try { await sendEmail({ to:studentEmail, subject:"Seus próximos treinos foram ajustados 💪", text:cleanText(normalizedBatch.studentMessage), html:`<div style="font-family:Arial,sans-serif"><p>${escapeHtml(cleanText(normalizedBatch.studentMessage)).replaceAll("\n","<br />")}</p></div>` }); } catch(e){ console.error("Falha ao enviar e-mail da adaptação em lote:",e); } }
      return NextResponse.json({ ok:true, action:"BATCH_ADAPTED", adjustedWorkoutCount:normalizedWorkouts.length, message:`${normalizedWorkouts.length} treino(s) pendente(s) e futuro(s) foram ajustados. O aluno recebeu a resposta no chat.` });
    }

    if (
      !preferenceId ||
      !["PREPARE_PROMPT", "PREPARE_PACKAGE", "VALIDATE_MANUAL", "APPLY", "FUTURE_ONLY"].includes(
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

    if (action === "PREPARE_PROMPT" || action === "PREPARE_PACKAGE") {
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

      if (action === "PREPARE_PACKAGE") {
        const zip = new JSZip();
        const safeStudentName = String(context.preference.student.name || "aluno")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "aluno";
        const currentPlan = context.workout.workoutPlan;
        const model = {
          name: currentPlan.name,
          description: currentPlan.description || "",
          objective: currentPlan.objective || "",
          focusAreas: currentPlan.focusAreas || "",
          intensity: currentPlan.intensity || "moderada",
          estimatedDurationMinutes: Number(currentPlan.estimatedDurationMinutes || 0),
          estimatedCaloriesMin: Number(currentPlan.estimatedCaloriesMin || 0),
          estimatedCaloriesMax: Number(currentPlan.estimatedCaloriesMax || 0),
          studentSummary: "",
          safetyNote: "",
          notes: "",
          rationale: "",
          studentMessage: "",
          exercises: currentPlan.exercises.map((exercise: any, index: number) => ({
            exerciseId: exercise.libraryExerciseId,
            series: Number(exercise.series || 3),
            reps: String(exercise.reps || "10"),
            weight: String(exercise.weight || "a definir pelo professor"),
            restTime: String(exercise.restTime || "60s"),
            notes: String(exercise.notes || ""),
            order: Number(exercise.order ?? index),
          })),
        };
        const manifest = {
          packageVersion: "2.0",
          purpose: "ADAPTAR_TREINO_PENDENTE",
          generatedAt: new Date().toISOString(),
          studentId: context.preference.studentId,
          studentName: context.preference.student.name,
          preferenceId: context.preference.id,
          workoutId: context.workout.id,
          workoutDate: context.workout.date.toISOString(),
          files: [
            "INSTRUCOES/LEIA_PRIMEIRO.txt",
            "INSTRUCOES/MODELO_RESPOSTA.json",
            "INSTRUCOES/RESPOSTA_AQUI.txt",
            "prompt.txt",
            "CONTEXTO/TREINO_ATUAL.json",
            "CONTEXTO/MEMORIA_TECNICA.json",
            "CONTEXTO/HISTORICO_RECENTE.json",
            "CONTEXTO/PREFERENCIAS_ATIVAS.json",
            "CONTEXTO/EVENTOS_DE_CUIDADO.json",
            "CONTEXTO/BIBLIOTECA_EXERCICIOS.json",
            "manifesto.json",
          ],
        };

        zip.file(
          "INSTRUCOES/LEIA_PRIMEIRO.txt",
          [
            "EXECUÇÃO DIRETA — LEIA E EXECUTE O prompt.txt.",
            "Analise todos os arquivos da pasta CONTEXTO antes de adaptar o treino.",
            "A memória técnica aprovada, os eventos de cuidado e os feedbacks recentes têm prioridade sobre suposições.",
            "Não faça progressão automática quando houver baixa adesão, dor, dificuldade ou informação insuficiente.",
            "Retorne somente o JSON válido no formato de INSTRUCOES/MODELO_RESPOSTA.json.",
            "Mantenha a data e o objetivo geral do treino.",
            "Use somente exerciseId presentes na biblioteca permitida.",
            "Quando possível, salve o resultado em resposta.txt.",
          ].join("\n")
        );
        zip.file("INSTRUCOES/MODELO_RESPOSTA.json", JSON.stringify(model, null, 2));
        zip.file(
          "INSTRUCOES/RESPOSTA_AQUI.txt",
          "Cole aqui somente o JSON final produzido pela IA e depois importe este TXT no Funcional UP Digital."
        );
        zip.file("prompt.txt", manualPrompt);
        zip.file("CONTEXTO/TREINO_ATUAL.json", JSON.stringify(model, null, 2));
        const technicalContext = context.technicalContext || {};
        zip.file(
          "CONTEXTO/MEMORIA_TECNICA.json",
          JSON.stringify(technicalContext.approvedMemories || [], null, 2)
        );
        zip.file(
          "CONTEXTO/HISTORICO_RECENTE.json",
          JSON.stringify({
            adherence: technicalContext.adherence || null,
            exerciseSignals: technicalContext.exerciseSignals || null,
          }, null, 2)
        );
        zip.file(
          "CONTEXTO/PREFERENCIAS_ATIVAS.json",
          JSON.stringify(context.activePreferences || technicalContext.activePreferences || [], null, 2)
        );
        zip.file(
          "CONTEXTO/EVENTOS_DE_CUIDADO.json",
          JSON.stringify(technicalContext.openCareEvents || [], null, 2)
        );
        zip.file(
          "CONTEXTO/BIBLIOTECA_EXERCICIOS.json",
          JSON.stringify(library.map((exercise: any) => ({
            exerciseId: exercise.id,
            name: exercise.name,
            group: exercise.muscleGroup,
            location: exercise.locationTags,
            equipment: exercise.equipmentTags,
            intensity: exercise.intensity,
          })), null, 2)
        );
        zip.file("manifesto.json", JSON.stringify(manifest, null, 2));

        const output = await zip.generateAsync({
          type: "arraybuffer",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        const filename = `pacote-adaptar-treino-${safeStudentName}.zip`;

        return new NextResponse(output, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      }

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
