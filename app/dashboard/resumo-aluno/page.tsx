"use client";
import { MANUAL_AI_EXECUTION_HEADER_LINES } from "@/lib/manual-ai-execution-header";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import Link from "next/link";
import { getSaoPauloCivilDateInput, getSaoPauloWeekday } from "@/lib/planning-window";
import { resolveRecurringWorkoutOffsets } from "@/lib/student-workout-days";

type StudentOption = {
  id: string;
  name: string;
  email?: string | null;
  professorName?: string | null;
  contractedTrainingDaysPerMonth?: number | null;
  preferredWorkoutDays?: string[];
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
};

type WorkoutPlanningSummaryResponse = {
  plans?: Array<{ id: string; date?: string | null; createdAt?: string | null }>;
  weeklyLimit?: number | null;
  weeklyPlansCount?: number | null;
  weeklyRemaining?: number | null;
  createdWorkoutDates?: string[];
  expectedWorkoutDates?: string[];
  expectedWorkoutCount?: number | null;
  planningSource?: string | null;
  effectivePlanningStart?: string | null;
  careReturn?: {
    active?: boolean;
    planningStart?: string | null;
    resolvedAt?: string | null;
  } | null;
};

type OpenQuestionContext = {
  id: string;
  createdAt: string;
  teacherName?: string | null;
  lastMessage?: string | null;
  conversationText?: string | null;
  messages?: Array<{
    id: string;
    senderRole?: string | null;
    content: string;
    createdAt: string;
  }>;
};

type SummaryResponse = {
  ok: boolean;
  generatedAt: string;
  student: {
    id: string;
    name: string;
    birthDate?: string | null;
    ageYears?: number | null;
    isMinor?: boolean;
    professorName?: string | null;
    weeklyLimit?: number | null;
  };
  metrics: Record<string, number>;
  evolutionContext?: {
    status?: string;
    reason?: string;
    requiresReviewBeforeRelease?: boolean;
    reviewAlerts?: string[];
  } | null;
  technicalContext?: {
    exerciseSignals?: {
      easy?: Array<{ exerciseName: string; count: number }>;
      difficult?: Array<{ exerciseName: string; count: number }>;
      skipped?: Array<{ exerciseName: string; count: number; reasons: string[] }>;
    };
    adherence?: { completed?: number; partial?: number; pendingOrMissed?: number; summary?: string };
    activePreferences?: Array<{ category: string; summary: string }>;
    approvedMemories?: Array<{
      category: string;
      title: string;
      summary: string;
      sourceDocumentName?: string | null;
      validUntil?: string | null;
    }>;
    openCareEvents?: Array<{ severity: string; title: string; description?: string | null }>;
  } | null;
  openQuestions?: OpenQuestionContext[];
  latestWorkout?: {
    id: string;
    date: string;
    status: string;
    notes?: string | null;
    plan?: { id: string; name: string; date?: string | null } | null;
  } | null;
  summaryText: string;
  aiPrompt: string;
};

type LibraryExercise = {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  active?: boolean;
  objectiveTags?: string | null;
  locationTags?: string | null;
  equipmentTags?: string | null;
  restrictionTags?: string | null;
  levelTags?: string | null;
  intensity?: string | null;
  instructions?: string | null;
  safetyNotes?: string | null;
  commonMistakes?: string | null;
  substitutions?: string | null;
  contraindications?: string | null;
};

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
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

function getNextMonday(referenceDate = new Date()): Date {
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);

  const day = date.getDay();
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;

  date.setDate(date.getDate() + daysUntilNextMonday);
  return date;
}

function getSafePlanningWeekStartIso(dateValue?: string | null): {
  weekStartIso: string;
  redirectedToNextWeek: boolean;
  reason?: string;
} {
  const parsedDate = parseDateInput(dateValue);
  const requestedWeekStart = parsedDate
    ? getWeekRange(parsedDate).startOfWeek
    : getNextMonday();

  // A semana operacional vai de segunda a domingo. Fim de semana pode ser
  // escolhido como dia de treino, então não redirecionamos mais sábado/domingo.
  return {
    weekStartIso: formatIsoDate(requestedWeekStart),
    redirectedToNextWeek: false,
  };
}


function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseExpectedWorkoutDatesParam(value?: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
}

function normalizeCurrentWeekExpectedDatesFallback(
  expectedDates: string[],
  weekStartIso: string
): string[] {
  if (!Array.isArray(expectedDates) || expectedDates.length === 0) {
    return [];
  }

  const todayIso = getSaoPauloCivilDateInput();
  const currentWeekStartIso = resolveWeekStartIso(todayIso);

  if (weekStartIso !== currentWeekStartIso) {
    return expectedDates;
  }

  const todayWeekday = getSaoPauloWeekday();

  if (todayWeekday < 0) {
    return expectedDates;
  }

  const weekStartDate = parseDateInput(weekStartIso);
  if (!weekStartDate) {
    return expectedDates;
  }

  const sundayIso = formatIsoDate(addDays(weekStartDate, 6));
  const datesStillValid = expectedDates.filter(
    (date) => date >= todayIso && date <= sundayIso
  );

  if (datesStillValid.length > 0) {
    return datesStillValid;
  }

  // Em semana corrente, uma data de novo treino que já passou nunca volta
  // para o pacote da IA. Se existe uma pendência e hoje ainda é dia útil,
  // usamos hoje como fallback seguro.
  return [todayIso];
}

function getWeekdayNameFromDateInput(value: string): string {
  const parsedDate = parseDateInput(value);

  if (!parsedDate) return "data informada";

  return parsedDate.toLocaleDateString("pt-BR", {
    weekday: "long",
  });
}

function getTrainingScheduleFromExpectedDates(expectedWorkoutDates: string[]) {
  return expectedWorkoutDates.map((date, index) => ({
    offset: index,
    weekday: getWeekdayNameFromDateInput(date),
    date,
  }));
}

function resolveWeekStartIso(dateValue?: string | null): string {
  const parsedDate = parseDateInput(dateValue);

  if (parsedDate) {
    return formatIsoDate(getWeekRange(parsedDate).startOfWeek);
  }

  return formatIsoDate(getNextMonday());
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getTrainingWeekdayOffsets(
  contractedTrainingDaysPerMonth?: number | null,
  preferredWorkoutDays?: unknown
): number[] {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) return [];

  const weeklyLimit =
    contracted <= 4 ? 1 :
    contracted <= 8 ? 2 :
    contracted <= 12 ? 3 :
    contracted <= 16 ? 4 :
    5;

  return resolveRecurringWorkoutOffsets(weeklyLimit, preferredWorkoutDays);
}

function getWeekdayName(offset: number): string {
  const names: Record<number, string> = {
    0: "segunda-feira",
    1: "terça-feira",
    2: "quarta-feira",
    3: "quinta-feira",
    4: "sexta-feira",
    5: "sábado",
    6: "domingo",
  };

  return names[offset] || "dia da semana";
}

function getTrainingSchedule(
  contractedTrainingDaysPerMonth?: number | null,
  weekStartIso?: string | null,
  preferredWorkoutDays?: unknown
) {
  const weekStartDate = parseDateInput(weekStartIso) || getNextMonday();
  const offsets = getTrainingWeekdayOffsets(contractedTrainingDaysPerMonth, preferredWorkoutDays);

  return offsets.map((offset) => ({
    offset,
    weekday: getWeekdayName(offset),
    date: formatIsoDate(addDays(weekStartDate, offset)),
  }));
}

function getCivilDateInput(value?: string | Date | null): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match?.[1]) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getCareReturnExpectedWorkoutDates({
  weekStartIso,
  planningStartIso,
  weeklyLimit,
}: {
  weekStartIso: string;
  planningStartIso?: string | null;
  weeklyLimit?: number | null;
}): string[] {
  const weekStart = parseDateInput(resolveWeekStartIso(weekStartIso));
  const planningStart = parseDateInput(planningStartIso || "");
  const limit = Math.max(Number(weeklyLimit || 0), 0);

  if (!weekStart || !planningStart || !limit) return [];

  const weekEndExclusive = addDays(weekStart, 7);
  const effectiveStart = planningStart.getTime() > weekStart.getTime()
    ? planningStart
    : weekStart;

  const availableWeekdays: string[] = [];
  const cursor = new Date(effectiveStart);
  cursor.setHours(12, 0, 0, 0);

  while (cursor.getTime() < weekEndExclusive.getTime()) {
    availableWeekdays.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  if (availableWeekdays.length === 0) return [];

  const targetCount = Math.min(limit, availableWeekdays.length);
  if (targetCount === 1) return [availableWeekdays[0]];

  const spreadDates = Array.from({ length: targetCount }, (_, index) => {
    const position = Math.round(
      (index * (availableWeekdays.length - 1)) / (targetCount - 1)
    );
    return availableWeekdays[position];
  });

  return Array.from(new Set(spreadDates)).slice(0, targetCount);
}

function getTrainingScheduleDescription(contractedTrainingDaysPerMonth?: number | null): string {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return "Quantidade contratada não configurada. Confirmar antes de montar treino.";
  }

  if (contracted <= 4) {
    return `Contrato de ${contracted} dia(s)/mês: gerar 1 treino por semana, respeitando o dia definido para o aluno.`;
  }

  if (contracted <= 8) {
    return `Contrato de ${contracted} dias/mês: gerar 2 treinos por semana, respeitando os dias definidos para o aluno.`;
  }

  if (contracted <= 12) {
    return `Contrato de ${contracted} dias/mês: gerar 3 treinos por semana, respeitando os dias definidos para o aluno e mantendo a distribuição escolhida.`;
  }

  if (contracted <= 16) {
    return `Contrato de ${contracted} dias/mês: gerar 4 treinos por semana, respeitando os dias definidos para o aluno.`;
  }

  return `Contrato de ${contracted} dias/mês: gerar 5 treinos por semana, respeitando os dias definidos para o aluno, inclusive sábado ou domingo quando selecionados.`;
}

function getAiValidationContext({
  studentId,
  contractedTrainingDaysPerMonth,
  weekStartIso,
  fallbackWorkoutCount,
  expectedWorkoutDatesOverride,
}: {
  studentId: string;
  contractedTrainingDaysPerMonth?: number | null;
  weekStartIso?: string | null;
  fallbackWorkoutCount?: number | null;
  expectedWorkoutDatesOverride?: string[];
}) {
  const weekStart = resolveWeekStartIso(weekStartIso);
  const weekStartDate = parseDateInput(weekStart) || getNextMonday();
  const weekEnd = formatIsoDate(addDays(weekStartDate, 6));
  const schedule = getTrainingSchedule(contractedTrainingDaysPerMonth, weekStart);
  const expectedWorkoutDates = expectedWorkoutDatesOverride && expectedWorkoutDatesOverride.length > 0
    ? expectedWorkoutDatesOverride
    : schedule.map((item) => item.date);
  const expectedWorkoutCount = expectedWorkoutDates.length || Number(fallbackWorkoutCount || 1);
  const validationKey = [
    "FVD",
    studentId,
    weekStart,
    String(expectedWorkoutCount),
    expectedWorkoutDates.join("_"),
  ].join("|");

  return {
    studentId,
    weekStart,
    weekEnd,
    expectedWorkoutDates,
    expectedWorkoutCount,
    validationKey,
  };
}

function normalizeCareText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function hasOpenCarePause(summaryData?: SummaryResponse | null): boolean {
  if (!summaryData) return false;

  /*
   * Regra correta:
   * bloquear somente quando a API informar que existe evento de cuidado
   * realmente aberto para o aluno.
   *
   * Não usamos mais busca de palavras dentro do resumo, motivo ou alertas,
   * porque esses textos podem citar "pausa por cuidado" apenas como orientação
   * geral e gerar falso bloqueio mesmo quando a Central de Cuidado está zerada.
   */
  const openCareEvents = Number(summaryData.metrics?.openCareEvents || 0);

  if (Number.isFinite(openCareEvents) && openCareEvents > 0) {
    return true;
  }

  /*
   * Compatibilidade para respostas futuras da API que tragam um status
   * estruturado e explícito de bloqueio, mesmo sem o contador.
   */
  const evolution = summaryData.evolutionContext || null;
  const status = normalizeCareText(evolution?.status);
  const explicitBlockingStatuses = [
    "PAUSA_POR_CUIDADO",
    "CARE_PAUSE",
    "BLOQUEADO_POR_CUIDADO",
    "BLOQUEIO_POR_CUIDADO",
  ];

  return (
    evolution?.requiresReviewBeforeRelease === true &&
    explicitBlockingStatuses.includes(status)
  );
}

function getCarePauseBlockedText(summaryData: SummaryResponse): string {
  const alerts = summaryData.evolutionContext?.reviewAlerts || [];

  return [
    "BLOQUEIO DE SEGURANÇA — PAUSA POR CUIDADO",
    "",
    `Aluno: ${summaryData.student.name}`,
    "Status da IA: REVISAO_HUMANA_OBRIGATORIA",
    "",
    "Este aluno possui pausa por cuidado aberta ou sinal de que está sem condição de treinar.",
    "Não gere JSON de treino normal enquanto este evento estiver aberto.",
    "",
    "O que fazer agora:",
    "1. Revisar a Central de Cuidado do Aluno.",
    "2. Responder/orientar o aluno se ainda houver dúvida aberta.",
    "3. Aguardar o aluno sinalizar que está apto para retomar.",
    "4. O professor deve revisar a retomada antes de montar/liberar novo treino.",
    "",
    "Regras do sistema:",
    "- Não montar treino evolutivo.",
    "- Não liberar treino normal.",
    "- Não usar este caso como baixa adesão comum.",
    "- Se houver dor persistente, limitação, queda, torção importante ou orientação médica pendente, orientar avaliação com profissional habilitado.",
    "",
    alerts.length > 0 ? "Alertas registrados:" : "Alertas registrados: nenhum alerta adicional informado.",
    ...alerts.map((alert) => `- ${alert}`),
  ].join("\n");
}


function applyContractScheduleToWorkouts(
  workouts: any[],
  contractedTrainingDaysPerMonth?: number | null,
  weekStartIso?: string | null,
  expectedWorkoutDatesOverride?: string[]
): {
  workouts: any[];
  scheduleDescription: string;
  scheduleWarning?: string;
} {
  const schedule = expectedWorkoutDatesOverride && expectedWorkoutDatesOverride.length > 0
    ? getTrainingScheduleFromExpectedDates(expectedWorkoutDatesOverride)
    : getTrainingSchedule(contractedTrainingDaysPerMonth, weekStartIso);
  const scheduleDescription = getTrainingScheduleDescription(contractedTrainingDaysPerMonth);

  if (schedule.length === 0) {
    return {
      workouts,
      scheduleDescription,
      scheduleWarning: "Não foi possível aplicar calendário automático porque a quantidade contratada não está configurada.",
    };
  }

  const originalCount = workouts.length;
  const limitedWorkouts = workouts.slice(0, schedule.length);

  const scheduledWorkouts = limitedWorkouts.map((workout, index) => {
    const scheduledDay = schedule[index];

    return {
      ...workout,
      date: scheduledDay?.date || workout.date || "",
      notes: [
        workout.notes,
        scheduledDay
          ? `Calendário automático aplicado: ${scheduledDay.weekday}, ${scheduledDay.date}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  let scheduleWarning: string | undefined;

  if (originalCount > schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treinos, mas o contrato permite ${schedule.length} treino(s) na semana. O sistema importou apenas os ${schedule.length} primeiros.`;
  }

  if (originalCount < schedule.length) {
    scheduleWarning = `A IA gerou ${originalCount} treino(s), mas o contrato sugere ${schedule.length} treino(s) na semana. Gere novamente ou complemente manualmente.`;
  }

  return {
    workouts: scheduledWorkouts,
    scheduleDescription,
    scheduleWarning,
  };
}

/**
 * Versão sem efeitos colaterais de resolveCareReturnPlanningTarget, segura
 * para consultar a programação de QUALQUER aluno (não apenas o selecionado
 * na tela) sem alterar o estado ou a URL da tela de um aluno único. Usada
 * pelo modo lote para calcular, para cada aluno do pacote, as mesmas datas
 * esperadas oficiais que o fluxo de um aluno já calcula hoje.
 */
async function fetchAuthoritativeExpectedWorkoutDates(
  studentId: string,
  weekStartIso: string,
  planningStudent?: { contractedTrainingDaysPerMonth?: number | null; preferredWorkoutDays?: string[] } | null
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `/api/workout-plan?studentId=${encodeURIComponent(studentId)}&date=${encodeURIComponent(weekStartIso)}&summary=1`,
      { cache: "no-store" }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as WorkoutPlanningSummaryResponse;
    const weeklyLimit = Math.max(Number(data.weeklyLimit || 0), 0);

    if (!weeklyLimit) return null;

    if (Array.isArray(data.expectedWorkoutDates)) {
      return data.expectedWorkoutDates
        .map((value) => String(value))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    }

    const createdDates = new Set(
      (Array.isArray(data.plans) ? data.plans : [])
        .map((plan) => getCivilDateInput(plan.date || plan.createdAt || null))
        .filter((value): value is string => Boolean(value))
    );

    const remainingCount = Number.isFinite(Number(data.weeklyRemaining))
      ? Math.max(Number(data.weeklyRemaining || 0), 0)
      : Math.max(weeklyLimit - createdDates.size, 0);

    if (remainingCount <= 0) return [];

    const weekStartIsoResolved = resolveWeekStartIso(weekStartIso);
    const weekStartDate = parseDateInput(weekStartIsoResolved);
    if (!weekStartDate) return null;

    const sundayIso = formatIsoDate(addDays(weekStartDate, 6));
    const todayIso = getSaoPauloCivilDateInput();
    const currentWeekStartIso = resolveWeekStartIso(todayIso);
    const isCurrentWeek = currentWeekStartIso === weekStartIsoResolved;
    const planningStart =
      getCivilDateInput(data.careReturn?.planningStart || data.effectivePlanningStart || weekStartIsoResolved) ||
      weekStartIsoResolved;
    const earliestAllowedDate = isCurrentWeek && todayIso > planningStart ? todayIso : planningStart;

    if (earliestAllowedDate > sundayIso) return [];

    const contractedDays = planningStudent?.contractedTrainingDaysPerMonth || weeklyLimit * 4;
    const canonicalDates = getTrainingSchedule(contractedDays, weekStartIsoResolved, planningStudent?.preferredWorkoutDays)
      .map((item) => item.date)
      .filter((date) => date >= earliestAllowedDate && date <= sundayIso && !createdDates.has(date));

    const weekdayFallbackDates: string[] = [];
    const hasStructuredPreferredWorkoutDays = Boolean(planningStudent?.preferredWorkoutDays?.length);
    const cursor = parseDateInput(earliestAllowedDate);

    if (cursor && !hasStructuredPreferredWorkoutDays) {
      while (formatIsoDate(cursor) <= sundayIso) {
        const date = formatIsoDate(cursor);

        if (!createdDates.has(date) && !canonicalDates.includes(date)) {
          weekdayFallbackDates.push(date);
        }

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return [...canonicalDates, ...weekdayFallbackDates].slice(0, remainingCount).sort();
  } catch {
    return null;
  }
}

type BatchStudentResult = {
  studentId: string;
  studentName: string;
  status: "pronto" | "erro";
  error?: string;
  draft?: Record<string, unknown>;
};

export default function ResumoAlunoPage() {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<"prompt" | "summary" | "jsonPrompt">("jsonPrompt");
  const [aiJsonText, setAiJsonText] = useState("");
  const [aiImportMessage, setAiImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [targetWeekStart, setTargetWeekStart] = useState("");
  const [targetExpectedWorkoutDates, setTargetExpectedWorkoutDates] = useState<string[]>([]);
  const [targetWorkoutId, setTargetWorkoutId] = useState<string | null>(null);
  const [safeWindowNotice, setSafeWindowNotice] = useState<string | null>(null);
  const [exerciseLibrary, setExerciseLibrary] = useState<LibraryExercise[]>([]);
  const [loadingExerciseLibrary, setLoadingExerciseLibrary] = useState(true);

  // Modo lote: gera/importa o pacote da IA para vários alunos de uma vez,
  // em vez de repetir o fluxo de um aluno por vez.
  const [batchMode, setBatchMode] = useState(false);
  const [batchSize, setBatchSize] = useState(5);
  const [batchEligibleIds, setBatchEligibleIds] = useState<string[]>([]);
  const [batchLoadingEligible, setBatchLoadingEligible] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchPrompt, setBatchPrompt] = useState("");
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchJsonText, setBatchJsonText] = useState("");
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchStudentResult[]>([]);
  const [batchMessage, setBatchMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  async function loadStudents(preselectId?: string | null) {
    setLoadingStudents(true);

    try {
      const res = await fetch("/api/students/ai-summary", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.students) ? data.students : [];
        setStudents(list);

        const idFromUrl = preselectId || "";
        const exists = list.some((student: StudentOption) => student.id === idFromUrl);

        if (exists) {
          setSelectedStudentId(idFromUrl);
        } else if (list.length > 0) {
          setSelectedStudentId(list[0].id);
        }
      } else {
        setMessage({ type: "error", text: "Erro ao carregar alunos." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao carregar alunos." });
    }

    setLoadingStudents(false);
  }

  async function loadExerciseLibrary(includeInactiveForEditing = false) {
    setLoadingExerciseLibrary(true);

    try {
      const res = await fetch(
        includeInactiveForEditing
          ? "/api/exercise-library?active=all"
          : "/api/exercise-library?active=1",
        {
        cache: "no-store",
        }
      );

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.exercises) ? data.exercises : [];
        setExerciseLibrary(list);
      } else {
        setExerciseLibrary([]);
      }
    } catch {
      setExerciseLibrary([]);
    }

    setLoadingExerciseLibrary(false);
  }

  async function loadOpenQuestionsContext(studentId: string): Promise<OpenQuestionContext[]> {
    if (!studentId) return [];

    try {
      // Usa a API de conversas que já existe no sistema. Assim o pacote de IA
      // não depende de uma rota nova e não corre o risco de a implantação ficar
      // incompleta. A API já aplica as permissões de professor/gestão e devolve
      // a conversa raiz com todas as respostas (children).
      const res = await fetch(`/api/questions?studentId=${encodeURIComponent(studentId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return [];

      const data = await res.json().catch(() => null);
      const conversations = Array.isArray(data) ? data : [];

      return conversations
        .filter((question: any) => !question?.resolvedAt && !question?.parentId)
        .map((question: any) => {
          const rawMessages = [question, ...(Array.isArray(question?.children) ? question.children : [])];
          const messages = rawMessages
            .filter((message: any) => String(message?.content || "").trim())
            .map((message: any) => ({
              id: String(message?.id || ""),
              senderRole: String(message?.senderRole || ""),
              content: String(message?.content || "").trim(),
              createdAt: String(message?.createdAt || ""),
            }));
          const conversationText = messages
            .map((message) => `${message.senderRole || "USUARIO"}: ${message.content}`)
            .join("\n");
          const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "";

          return {
            id: String(question?.id || ""),
            createdAt: String(question?.createdAt || ""),
            teacherName: question?.teacher?.name || null,
            lastMessage,
            conversationText,
            messages,
          } satisfies OpenQuestionContext;
        });
    } catch {
      return [];
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const weekDateFromUrl = params.get("date") || params.get("weekStart");
    const workoutIdFromUrl = params.get("workoutId");
    const expectedDatesFromUrl = parseExpectedWorkoutDatesParam(
      params.get("expectedWorkoutDates") || params.get("expectedDates")
    );

    const safeWeek = getSafePlanningWeekStartIso(weekDateFromUrl);
    const datesFromNavigation =
      expectedDatesFromUrl.length > 0
        ? expectedDatesFromUrl
        : weekDateFromUrl
          ? [weekDateFromUrl]
          : [];
    const editTargetDates = workoutIdFromUrl && weekDateFromUrl
      ? [weekDateFromUrl]
      : datesFromNavigation;
    const safeTargetDates = workoutIdFromUrl
      ? editTargetDates
      : normalizeCurrentWeekExpectedDatesFallback(
          editTargetDates,
          safeWeek.weekStartIso
        );

    setTargetWeekStart(safeWeek.weekStartIso);
    setTargetExpectedWorkoutDates(
      safeWeek.redirectedToNextWeek ? [] : safeTargetDates
    );
    setTargetWorkoutId(workoutIdFromUrl || null);
    setSafeWindowNotice(safeWeek.reason || null);

    if (safeWeek.reason) {
      setMessage({ type: "error", text: safeWeek.reason });
    }

    loadStudents(params.get("studentId"));
    loadExerciseLibrary(Boolean(workoutIdFromUrl));
  }, []);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);
  const selectedStudentMissingBirthDate =
    Boolean(selectedStudent) &&
    (selectedStudent?.ageYears === null || selectedStudent?.ageYears === undefined);

  useEffect(() => {
    if (!selectedStudentId || !targetWeekStart || targetWorkoutId) return;
    void resolveCareReturnPlanningTarget(selectedStudentId);
  }, [selectedStudentId, targetWeekStart, targetWorkoutId]);

  function compactText(value?: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function joinTextParts(parts: Array<string | null | undefined>): string {
    return parts
      .map((part) => compactText(part))
      .filter(Boolean)
      .join(" ");
  }

  function buildExercisePurpose(exercise: LibraryExercise): string {
    const objectiveText = compactText(exercise.objectiveTags)
      ? `objetivo=${compactText(exercise.objectiveTags)}`
      : "";

    return joinTextParts([
      exercise.description ? `praQueServe=${exercise.description}` : null,
      objectiveText,
    ]);
  }

  function buildExerciseSafetyGuidance(exercise: LibraryExercise): string {
    return joinTextParts([
      exercise.safetyNotes ? `cuidadosExecucao=${exercise.safetyNotes}` : null,
      exercise.restrictionTags ? `tagsCuidado=${exercise.restrictionTags}` : null,
      exercise.commonMistakes ? `errosComuns=${exercise.commonMistakes}` : null,
      exercise.contraindications ? `contraindicacoes=${exercise.contraindications}` : null,
    ]);
  }

  function normalizePromptSearch(value: unknown): string {
    return compactText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function getCompactStudentContext(summaryData: SummaryResponse): string {
    const source = String(summaryData.summaryText || "");
    const relevantLines = source
      .split(/\r?\n/)
      .map((line) => compactText(line))
      .filter(Boolean)
      .filter((line) =>
        /(objetiv|prefer|restri|dor|desconfort|equip|local|academ|casa|corrida|ades[aã]o|conclu|dif[ií]cil|f[aá]cil|n[aã]o fez|cuidado|mem[oó]ria|bioimped|avalia|idade|peso|altura)/i.test(line)
      )
      .slice(0, 28);

    const compact = relevantLines.join(" | ");
    if (compact) return compact.slice(0, 6000);

    return compactText(source).slice(0, 6000) || "Sem informações adicionais relevantes.";
  }

  function parseApprovedMemorySummary(value?: string | null): { text: string; data: Record<string, unknown> | null } {
    const raw = compactText(value);
    if (!raw) return { text: "", data: null };

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const data = parsed as Record<string, unknown>;
        const text = compactText(
          data.summary ||
          data.summaryForTraining ||
          (Array.isArray(data.availableEquipment)
            ? `Equipamentos: ${data.availableEquipment.map((item) => String(item)).join(", ")}`
            : raw)
        );
        return { text, data };
      }
    } catch {
      // Memórias antigas podem conter texto simples.
    }

    return { text: raw, data: null };
  }

  function parseNestedJsonObject(value: unknown): Record<string, unknown> | null {
    const raw = compactText(value);
    if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) return null;

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  function normalizeTrainingEnvironmentData(data: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!data) return null;

    const nestedSummary = parseNestedJsonObject(data.summary);
    if (nestedSummary && (
      "type" in nestedSummary ||
      "equipmentLevel" in nestedSummary ||
      "availableEquipment" in nestedSummary ||
      "observations" in nestedSummary
    )) {
      return nestedSummary;
    }

    return data;
  }

  function getEquipmentFromSummaryText(summaryText: string): string[] {
    const match = String(summaryText || "").match(/Equipamentos\/materiais disponíveis:\s*([^\n]+)/i);
    if (!match?.[1]) return [];

    const raw = match[1]
      .replace(/^Academia completa \(base considerada\):\s*/i, "")
      .trim();

    return raw
      .split(/[,;|]/)
      .map((item) => compactText(item))
      .filter(Boolean);
  }

  function buildConsolidatedTrainingContext(summaryData: SummaryResponse) {
    const memories = [...(summaryData.technicalContext?.approvedMemories || [])]
      .map((memory) => ({
        ...memory,
        category: String(memory.category || "").toUpperCase(),
        parsed: parseApprovedMemorySummary(memory.summary),
      }));

    const byCategory = (categories: string[]) => memories.filter((memory) => categories.includes(memory.category));
    const latest = (categories: string[]) => byCategory(categories)[0] || null;
    const equipmentMemories = byCategory(["EQUIPMENT_AVAILABLE"]);
    const environmentMemory = latest(["TRAINING_ENVIRONMENT"]);
    const goalMemory = latest(["GOAL", "TRAINING_GOAL", "OBJECTIVE"]);
    const cardioMemory = latest(["CARDIO_ROUTINE"]);
    const scheduleMemories = byCategory(["TRAINING_PREFERENCE", "PREFERENCE_POSITIVE"])
      .filter((memory) => /(hor[aá]rio|dia|semana|06:00|manh[aã])/i.test(`${memory.title} ${memory.parsed.text}`));

    const environmentData = normalizeTrainingEnvironmentData(environmentMemory?.parsed.data || null);

    const documentAnalysisMemories = byCategory(["DOCUMENT_ANALYSIS", "DOCUMENT"]);
    const extractedTrainingEnvironment = documentAnalysisMemories
      .map((memory) => memory.parsed.data)
      .map((data) => {
        if (!data) return null;
        const direct = data.trainingEnvironment;
        if (direct && typeof direct === "object") {
          return normalizeTrainingEnvironmentData(direct as Record<string, unknown>);
        }

        const sourceResponse = data.sourceResponse;
        if (sourceResponse && typeof sourceResponse === "object") {
          const nested = (sourceResponse as Record<string, unknown>).trainingEnvironment;
          if (nested && typeof nested === "object") {
            return normalizeTrainingEnvironmentData(nested as Record<string, unknown>);
          }
        }

        return null;
      })
      .find(Boolean) || null;

    const environmentEquipment = [environmentData, extractedTrainingEnvironment]
      .flatMap((data) =>
        Array.isArray(data?.availableEquipment)
          ? data.availableEquipment.map((item) => String(item))
          : []
      );

    const individualEquipment = equipmentMemories
      .map((memory) => memory.title || memory.parsed.text)
      .filter(Boolean);

    const summaryEquipment = getEquipmentFromSummaryText(summaryData.summaryText || "");

    const consolidatedEquipment = Array.from(
      new Set(
        [...environmentEquipment, ...individualEquipment, ...summaryEquipment]
          .map((item) => compactText(item))
          .filter(Boolean)
      )
    );

    const conflictsResolved: Array<{ field: string; previousSource: string; selectedSource: string; decision: string }> = [];
    if (consolidatedEquipment.length > 0 && /nenhum equipamento|sem equipamento/i.test(summaryData.summaryText || "")) {
      conflictsResolved.push({
        field: "availableEquipment",
        previousSource: "cadastro/onboarding antigo",
        selectedSource: "memória técnica aprovada mais recente",
        decision: `Usar equipamentos confirmados: ${consolidatedEquipment.join(", ")}. O conflito não bloqueia a montagem do treino.`,
      });
    }

    return {
      precedenceRules: [
        "Evento de cuidado aberto com pausa bloqueia a geração.",
        "Fora desse caso, nunca recuse montar o treino apenas por conflito entre cadastro antigo e memória técnica.",
        "Memória técnica APPROVED mais recente prevalece sobre onboarding, cadastro antigo ou mensagem anterior.",
        "Quando faltar um dado secundário, gere planejamento conservador e sinalize revisão humana; não deixe o aluno sem treino.",
      ],
      goal: goalMemory?.parsed.text || "Usar o objetivo cadastrado no RESUMO_ALUNO quando não houver memória aprovada mais recente.",
      schedulePreferences: scheduleMemories.map((memory) => memory.parsed.text || memory.title),
      cardioRoutine: cardioMemory?.parsed.text || null,
      trainingEnvironment: environmentData || extractedTrainingEnvironment || environmentMemory?.parsed.text || null,
      availableEquipment: consolidatedEquipment,
      activePreferences: summaryData.technicalContext?.activePreferences || [],
      healthAndRestrictions: byCategory(["HEALTH_PERMANENT", "HEALTH_TEMPORARY", "MEDICAL_GUIDANCE", "EXERCISE_AVOID"])
        .map((memory) => ({ category: memory.category, title: memory.title, summary: memory.parsed.text })),
      conflictsResolved,
      generationDecision: conflictsResolved.length
        ? "GERAR_TREINO_USANDO_MEMORIA_MAIS_RECENTE"
        : "GERAR_TREINO_COM_CONTEXTO_DISPONIVEL",
    };
  }

  function buildConsolidatedSummaryText(
    summaryData: SummaryResponse,
    consolidatedContext: ReturnType<typeof buildConsolidatedTrainingContext>
  ): string {
    const source = String(summaryData.summaryText || "");
    const equipment = Array.isArray(consolidatedContext.availableEquipment)
      ? consolidatedContext.availableEquipment.map((item) => compactText(item)).filter(Boolean)
      : [];

    if (equipment.length === 0) return source;

    const consolidatedLine = `Equipamentos/materiais disponíveis: ${equipment.join(", ")}`;
    const patterns = [
      /^Equipamentos\/materiais disponíveis:.*$/im,
      /^Equipamentos disponíveis:.*$/im,
      /^Materiais disponíveis:.*$/im,
    ];

    for (const pattern of patterns) {
      if (pattern.test(source)) {
        return source.replace(pattern, consolidatedLine);
      }
    }

    return [source.trim(), "", "Contexto consolidado mais recente:", consolidatedLine]
      .filter(Boolean)
      .join("\n");
  }

  function selectPromptLibrary(summaryData: SummaryResponse): LibraryExercise[] {
    const consolidatedContext = buildConsolidatedTrainingContext(summaryData);
    const context = normalizePromptSearch(
      [
        summaryData.summaryText,
        JSON.stringify(consolidatedContext),
        selectedStudent?.name,
        summaryData.evolutionContext?.reason,
      ]
        .filter(Boolean)
        .join(" ")
    );

    const stopWords = new Set([
      "aluno", "treino", "treinos", "para", "com", "sem", "mais", "uma", "como",
      "objetivo", "objetivos", "professor", "semana", "atual", "dados", "informacao",
      "informacoes", "deve", "fazer", "realizar", "geral", "atividade", "fisica",
    ]);
    const terms = Array.from(new Set(
      context.split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !stopWords.has(term))
    )).slice(0, 50);

    const boosts: string[] = [];
    if (context.includes("corrida")) boosts.push("corrida", "pernas", "gluteos", "panturrilha", "core", "quadril", "tornozelo");
    if (context.includes("academia")) boosts.push("academia", "maquina", "halteres", "polia");
    if (context.includes("casa")) boosts.push("casa", "peso corporal", "nenhum equipamento", "elastico");
    if (context.includes("emagrec")) boosts.push("condicionamento", "corpo inteiro", "cardio");
    if (context.includes("hipertrof") || context.includes("massa muscular")) boosts.push("hipertrofia", "fortalecimento", "halteres", "maquinas");
    if (context.includes("mobilidade")) boosts.push("mobilidade", "alongamento");

    const wantsGymMachines =
      context.includes("academia") &&
      /(maquina|maquinas|leg press|cadeira extensora|cadeira flexora|polia|puxada|remada)/.test(context);

    const eligibleLibrary = exerciseLibrary.filter((exercise) => {
      if (exercise.active !== false) return true;
      if (!targetWorkoutId) return false;

      // Em edição podemos reaproveitar exercício oficial legado/inativo
      // somente quando o próprio histórico consolidado do aluno cita esse
      // exercício. O backend repete a mesma proteção usando os IDs históricos.
      const normalizedName = normalizePromptSearch(exercise.name);
      return normalizedName.length >= 4 && context.includes(normalizedName);
    });

    const scored = eligibleLibrary
      .map((exercise, index) => {
        const searchable = normalizePromptSearch([
          exercise.name, exercise.muscleGroup, exercise.objectiveTags, exercise.locationTags,
          exercise.equipmentTags, exercise.levelTags, exercise.intensity,
        ].join(" "));
        let score = 0;
        for (const term of terms) if (searchable.includes(term)) score += term.length >= 7 ? 5 : 3;
        for (const boost of boosts) if (searchable.includes(boost)) score += 10;

        const isMachineBased = /(maquina|maquinas|leg press|cadeira (extensora|flexora|abdutora|adutora)|polia|puxada|remada baixa|chest press|smith|barra guiada)/.test(searchable);
        if (wantsGymMachines && isMachineBased) score += 60;

        return { exercise, score, index, isMachineBased };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!wantsGymMachines) {
      return scored.slice(0, 32).map((item) => item.exercise);
    }

    // Em academia completa com preferência confirmada por máquinas, garantimos
    // que a IA enxergue os exercícios de aparelhos. Depois completamos a lista
    // com alternativas relevantes para aquecimento, mobilidade e core.
    const machineFirst = scored.filter((item) => item.isMachineBased).slice(0, 18);
    const selectedIds = new Set(machineFirst.map((item) => item.exercise.id));
    const complementary = scored
      .filter((item) => !selectedIds.has(item.exercise.id))
      .slice(0, Math.max(32 - machineFirst.length, 0));

    return [...machineFirst, ...complementary].slice(0, 32).map((item) => item.exercise);
  }

  function getExerciseLibraryPromptLines(summaryData: SummaryResponse): string[] {
    if (exerciseLibrary.length === 0) {
      return [
        "BIBLIOTECA PERMITIDA: []",
        "Não gere treino enquanto a biblioteca estiver vazia.",
      ];
    }

    const selected = selectPromptLibrary(summaryData);
    const compactLibrary = selected.map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      group: exercise.muscleGroup || undefined,
      location: compactText(exercise.locationTags) || undefined,
      equipment: compactText(exercise.equipmentTags) || undefined,
      intensity: compactText(exercise.intensity) || undefined,
    }));

    return [
      `BIBLIOTECA PERMITIDA (${compactLibrary.length} opções já filtradas pelo sistema): ${JSON.stringify(compactLibrary)}`,
      "Use somente esses exerciseId. O sistema completará descrição, execução e segurança a partir do cadastro oficial.",
    ];
  }

  function findLibraryExerciseByPayload(exercise: any): LibraryExercise | null {
    const exerciseId = String(
      exercise?.exerciseId ||
        exercise?.libraryExerciseId ||
        exercise?.exerciseLibraryId ||
        ""
    ).trim();

    if (!exerciseId) return null;

    return exerciseLibrary.find((item) => item.id === exerciseId) || null;
  }

  function getJsonPrompt(summaryData: SummaryResponse, expectedWorkoutDatesOverride?: string[]): string {
    if (hasOpenCarePause(summaryData)) {
      return getCarePauseBlockedText(summaryData);
    }

    const contractedDays = selectedStudent?.contractedTrainingDaysPerMonth || null;
    const validationContext = getAiValidationContext({
      studentId: summaryData.student.id,
      contractedTrainingDaysPerMonth: contractedDays,
      weekStartIso: targetWeekStart,
      fallbackWorkoutCount: summaryData.student.weeklyLimit,
      expectedWorkoutDatesOverride:
        expectedWorkoutDatesOverride !== undefined
          ? expectedWorkoutDatesOverride
          : targetExpectedWorkoutDates,
    });
    const schedule = validationContext.expectedWorkoutDates.length > 0
      ? getTrainingScheduleFromExpectedDates(validationContext.expectedWorkoutDates)
      : getTrainingSchedule(contractedDays, validationContext.weekStart);
    const effectiveExpectedDates =
      expectedWorkoutDatesOverride !== undefined
        ? expectedWorkoutDatesOverride
        : targetExpectedWorkoutDates;
    const scheduleDescription = effectiveExpectedDates.length > 0
      ? `Planejamento complementar/retomada: usar somente as datas obrigatórias desta solicitação (${effectiveExpectedDates.join(", ")}).`
      : getTrainingScheduleDescription(contractedDays);
    const expectedWorkoutCount = validationContext.expectedWorkoutCount;
    const scheduleLines = schedule.length
      ? schedule.map((item, index) => `- Treino ${index + 1}: ${item.weekday}, ${item.date}`)
      : ["- Sem calendário automático porque a quantidade contratada não está configurada."];
    const expectedDatesJson = validationContext.expectedWorkoutDates
      .map((item) => `"${item}"`)
      .join(", ");

    const compactContext = getCompactStudentContext(summaryData);
    const consolidatedContext = buildConsolidatedTrainingContext(summaryData);
    const evolution = summaryData.evolutionContext || {};
    const validationPayload = {
      studentId: validationContext.studentId,
      weekStart: validationContext.weekStart,
      weekEnd: validationContext.weekEnd,
      expectedWorkoutCount: validationContext.expectedWorkoutCount,
      expectedWorkoutDates: validationContext.expectedWorkoutDates,
      validationKey: validationContext.validationKey,
    };
    const editingInstruction = targetWorkoutId
      ? `ALTERAÇÃO DE TREINO EXISTENTE: workoutId=${targetWorkoutId}. Gere exatamente 1 treino para a data obrigatória informada e substitua apenas o conteúdo desse treino. Não crie treino adicional e não altere os demais treinos da semana.`
      : "MONTAGEM DE TREINO: gere somente os treinos ainda faltantes nas datas obrigatórias informadas.";

    return [
      ...MANUAL_AI_EXECUTION_HEADER_LINES,
      targetWorkoutId
        ? "Altere o treino existente para apoiar o professor de educação física."
        : "Monte os treinos da semana para apoiar o professor de educação física.",
      "Responda somente com JSON válido, sem markdown, comentários ou explicações.",
      "Use somente exerciseId da biblioteca permitida. Não invente exercícios, cargas, equipamentos, lesões, restrições ou diagnósticos.",
      "Respeite objetivo, local, equipamentos, preferências, adesão, histórico e cuidados. Dor/desconforto impede progressão automática e exige revisão humana.",
      "Se o contexto mais recente indicar ACADEMIA e preferência por MÁQUINAS/APARELHOS, priorize exercícios de máquinas/polias disponíveis na biblioteca e preserve o padrão do histórico recente. Não substitua silenciosamente por um treino inteiro sem aparelhos, salvo conflito de segurança explícito.",
      "Esta solicitação pode ser complementar: gere SOMENTE os treinos das datas obrigatórias informadas em aiValidation. Não regenere nem substitua treinos que já existem em outras datas da mesma semana.",
      "Se os dados forem insuficientes ou a adesão estiver baixa, faça planejamento conservador e sinalize isso em evolutionDecision.",
      "NÃO recuse gerar o treino por conflito entre cadastro antigo e memória técnica. Use a memória APPROVED mais recente e registre o conflito em reviewAlerts.",
      "Só deixe de gerar quando houver pausa por cuidado aberta, biblioteca vazia ou validação imutável inválida.",
      "Calorias são faixa estimada e conservadora, nunca promessa. O professor revisará antes de liberar.",
      editingInstruction,
      "",
      `ALUNO: ${summaryData.student.name} | studentId=${summaryData.student.id}`,
      `SEMANA E VALIDAÇÃO IMUTÁVEL: ${JSON.stringify(validationPayload)}`,
      `CALENDÁRIO DO CONTRATO: ${scheduleDescription} Nesta solicitação, gere somente ${expectedWorkoutCount} treino(s) restante(s), nas datas obrigatórias: ${validationContext.expectedWorkoutDates.join(", ") || "não configuradas"}.`,
      `DECISÃO PRÉVIA DO SISTEMA: ${JSON.stringify({
        status: evolution.status || "PRE_PLANEJAMENTO_CONSERVADOR",
        reason: evolution.reason || "Revisar contexto antes da liberação.",
        alerts: evolution.reviewAlerts || [],
      })}`,
      `CONTEXTO CONSOLIDADO E PRECEDÊNCIA: ${JSON.stringify(consolidatedContext)}`,
      `DÚVIDAS/FEEDBACKS ABERTOS DO ALUNO — CONTEXTO OBRIGATÓRIO: ${JSON.stringify(summaryData.openQuestions || [])}`,
      "REGRA PARA DÚVIDAS/FEEDBACKS ABERTOS: considere o conteúdo ao ajustar o próximo treino. Preserve o que o aluno disse que funcionou, incorpore pedidos de ajuste quando forem seguros e coerentes, e leve alertas operacionais para reviewAlerts. Uma mensagem ainda sem resposta NÃO bloqueia a geração do treino por si só; bloqueie apenas quando houver pausa por cuidado aberta ou outra condição de segurança já sinalizada pelo sistema. O professor responderá/revisará antes da liberação final.",
      `CONTEXTO ESSENCIAL DO ALUNO: ${compactContext}`,
      ...getExerciseLibraryPromptLines(summaryData),
      "",
      "FORMATO OBRIGATÓRIO:",
      `{"studentId":"${summaryData.student.id}","studentName":"${summaryData.student.name.replaceAll('"', "'")}","aiValidation":${JSON.stringify(validationPayload)},"evolutionDecision":{"status":"PRE_PLANEJAMENTO_CONSERVADOR","reason":"motivo objetivo","requiresReviewBeforeRelease":true,"reviewAlerts":[]},"workouts":[{"name":"Treino A","date":"${schedule[0]?.date || "AAAA-MM-DD"}","description":"","objective":"","focusAreas":"","intensity":"leve|moderada|alta","estimatedDurationMinutes":40,"estimatedCaloriesMin":0,"estimatedCaloriesMax":0,"studentSummary":"","safetyNote":"","notes":"","exercises":[{"exerciseId":"ID_DA_BIBLIOTECA","series":3,"reps":"10-12","weight":"a definir pelo professor","restTime":"60s","notes":"","order":0}]}]}`,
      `Gere exatamente ${expectedWorkoutCount} treino(s), nas datas obrigatórias e mantendo aiValidation sem qualquer alteração.${targetWorkoutId ? " Esta resposta será usada para ATUALIZAR o treino existente, não para criar um novo." : ""}`,
    ].join("\n");
  }

  function extractJsonFromText(rawText: string): any {
    const raw = rawText.trim();

    if (!raw) {
      throw new Error("Cole o JSON gerado pela IA.");
    }

    const codeBlockMatch = raw.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
    const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw;

    return JSON.parse(candidate);
  }

  function normalizeAiWorkoutPayload(
    payload: any,
    expectedWorkoutDatesOverride?: string[],
    studentIdOverride?: string
  ): any {
    const workouts = Array.isArray(payload?.workouts)
      ? payload.workouts
      : Array.isArray(payload?.treinos)
        ? payload.treinos
        : [];

    const payloadStudentId = String(payload?.studentId || "").trim();
    const effectiveStudentId = String(studentIdOverride || selectedStudentId || "").trim();
    const effectiveStudent = students.find((student) => student.id === effectiveStudentId) || null;

    if (!payloadStudentId) {
      throw new Error("O JSON precisa ter studentId.");
    }

    if (!effectiveStudentId || payloadStudentId !== effectiveStudentId) {
      throw new Error("Este JSON não pertence ao aluno selecionado. Importe novamente o arquivo correto.");
    }

    if (workouts.length === 0) {
      throw new Error("O JSON precisa ter pelo menos um treino em workouts.");
    }

    if (exerciseLibrary.length === 0) {
      throw new Error("A biblioteca de exercícios está vazia. Cadastre exercícios antes de importar treino da IA.");
    }

    const contractedDays = effectiveStudent?.contractedTrainingDaysPerMonth || null;
    const aiValidationFromPayload = payload?.aiValidation || payload?.security || null;
    const payloadWeekStart = String(aiValidationFromPayload?.weekStart || targetWeekStart || "");
    const expectedContext = getAiValidationContext({
      studentId: effectiveStudentId,
      contractedTrainingDaysPerMonth: contractedDays,
      weekStartIso: payloadWeekStart || targetWeekStart,
      expectedWorkoutDatesOverride:
        expectedWorkoutDatesOverride !== undefined
          ? expectedWorkoutDatesOverride
          : targetExpectedWorkoutDates,
    });
    const effectiveExpectedWorkoutDates = targetWorkoutId
      ? expectedContext.expectedWorkoutDates
      : normalizeCurrentWeekExpectedDatesFallback(
          expectedContext.expectedWorkoutDates,
          expectedContext.weekStart
        );
    const effectiveExpectedContext = getAiValidationContext({
      studentId: expectedContext.studentId,
      contractedTrainingDaysPerMonth: contractedDays,
      weekStartIso: expectedContext.weekStart,
      fallbackWorkoutCount: expectedContext.expectedWorkoutCount,
      expectedWorkoutDatesOverride: effectiveExpectedWorkoutDates,
    });
    const aiValidation = aiValidationFromPayload;

    if (!aiValidation) {
      throw new Error("O JSON não possui aiValidation. Copie novamente o Prompt JSON atualizado e gere outro arquivo pela IA.");
    }

    if (String(aiValidation.studentId || "") !== effectiveExpectedContext.studentId) {
      throw new Error("A chave de segurança não pertence ao aluno selecionado.");
    }

    if (String(aiValidation.weekStart || "") !== effectiveExpectedContext.weekStart) {
      throw new Error("Este JSON é de outra semana. Gere novamente o resumo pela pendência correta.");
    }

    if (String(aiValidation.weekEnd || "") !== effectiveExpectedContext.weekEnd) {
      throw new Error("A data final da semana não confere com a semana selecionada.");
    }

    if (Number(aiValidation.expectedWorkoutCount || 0) !== effectiveExpectedContext.expectedWorkoutCount) {
      throw new Error("A quantidade de treinos do JSON não confere com o contrato/semana selecionados.");
    }

    const validationDates = Array.isArray(aiValidation.expectedWorkoutDates)
      ? aiValidation.expectedWorkoutDates.map((item: unknown) => String(item))
      : [];

    if (effectiveExpectedContext.expectedWorkoutDates.length > 0) {
      const expectedDatesText = effectiveExpectedContext.expectedWorkoutDates.join(", ");
      const validationDatesText = validationDates.join(", ");

      if (validationDatesText !== expectedDatesText) {
        throw new Error("As datas esperadas do aiValidation não conferem com a semana selecionada.");
      }

      if (workouts.length !== effectiveExpectedContext.expectedWorkoutDates.length) {
        throw new Error(`O contrato espera ${effectiveExpectedContext.expectedWorkoutDates.length} treino(s) nesta semana, mas o JSON trouxe ${workouts.length}.`);
      }
    }

    if (String(aiValidation.validationKey || "") !== effectiveExpectedContext.validationKey) {
      throw new Error("A chave de validação não confere. Gere novamente o resumo pela tela correta.");
    }

    const rawEvolutionDecision = payload?.evolutionDecision || payload?.evolucao || payload?.evolution || null;
    const evolutionDecision = {
      status: String(rawEvolutionDecision?.status || "PRE_PLANEJAMENTO_CONSERVADOR"),
      reason: String(rawEvolutionDecision?.reason || rawEvolutionDecision?.motivo || "Treino importado para revisão do professor."),
      requiresReviewBeforeRelease:
        rawEvolutionDecision?.requiresReviewBeforeRelease === false || rawEvolutionDecision?.requerRevisaoAntesDeLiberar === false
          ? false
          : true,
      reviewAlerts: Array.isArray(rawEvolutionDecision?.reviewAlerts)
        ? rawEvolutionDecision.reviewAlerts.map((item: unknown) => String(item))
        : Array.isArray(rawEvolutionDecision?.alertasRevisao)
          ? rawEvolutionDecision.alertasRevisao.map((item: unknown) => String(item))
          : ["Professor deve revisar dados atualizados antes de liberar a próxima semana."],
    };

    const normalizedWorkouts = workouts.map((workout: any, workoutIndex: number) => {
      const workoutDate = String(workout?.date || workout?.data || "");
      const expectedDate = effectiveExpectedContext.expectedWorkoutDates[workoutIndex];

      if (expectedDate && workoutDate !== expectedDate) {
        throw new Error(`A data do treino ${workoutIndex + 1} deveria ser ${expectedDate}, mas veio ${workoutDate || "sem data"}.`);
      }

      return {
        name: String(workout?.name || workout?.nome || `Treino ${workoutIndex + 1}`),
        date: workoutDate,
        description: String(workout?.description || workout?.descricao || ""),
        objective: String(workout?.objective || workout?.objetivo || ""),
        focusAreas: String(workout?.focusAreas || workout?.focus_areas || workout?.focos || workout?.foco || ""),
        intensity: String(workout?.intensity || workout?.intensidade || ""),
        estimatedDurationMinutes:
          Number(workout?.estimatedDurationMinutes || workout?.estimated_duration_minutes || workout?.duracaoEstimadaMinutos || 0) || null,
        estimatedCaloriesMin:
          Number(workout?.estimatedCaloriesMin || workout?.estimated_calories_min || workout?.caloriasMin || 0) || null,
        estimatedCaloriesMax:
          Number(workout?.estimatedCaloriesMax || workout?.estimated_calories_max || workout?.caloriasMax || 0) || null,
        studentSummary: String(workout?.studentSummary || workout?.student_summary || workout?.resumoAluno || workout?.resumo || ""),
        safetyNote: String(workout?.safetyNote || workout?.safety_note || workout?.observacaoSeguranca || ""),
        notes: String(workout?.notes || workout?.observacoes || ""),
        exercises: (Array.isArray(workout?.exercises) ? workout.exercises : workout?.exercicios || []).map((exercise: any, index: number) => {
          const libraryExercise = findLibraryExerciseByPayload(exercise);

          if (!libraryExercise) {
            throw new Error(`O exercício ${index + 1} do treino ${workoutIndex + 1} não possui exerciseId válido da biblioteca oficial.`);
          }

          return {
            libraryExerciseId: libraryExercise.id,
            exerciseId: libraryExercise.id,
            name: libraryExercise.name,
            description: String(exercise?.description || exercise?.descricao || libraryExercise.description || ""),
            purpose: String(exercise?.purpose || exercise?.praQueServe || libraryExercise.description || ""),
            instructions: String(exercise?.instructions || exercise?.comoExecutar || libraryExercise.instructions || libraryExercise.description || ""),
            safetyGuidance: String(exercise?.safetyGuidance || exercise?.cuidadosExecucao || buildExerciseSafetyGuidance(libraryExercise) || ""),
            commonMistakes: String(exercise?.commonMistakes || exercise?.errosComuns || libraryExercise.commonMistakes || ""),
            contraindications: String(exercise?.contraindications || exercise?.contraindicacoes || libraryExercise.contraindications || ""),
            series: Number(exercise?.series || exercise?.serie || exercise?.sets || 3),
            reps: String(exercise?.reps || exercise?.repeticoes || exercise?.repetições || "10"),
            weight: String(exercise?.weight || exercise?.carga || ""),
            restTime: String(exercise?.restTime || exercise?.descanso || "60s"),
            notes: String(exercise?.notes || exercise?.observacoes || ""),
            order: Number.isFinite(Number(exercise?.order)) ? Number(exercise.order) : index,
            imageUrl: libraryExercise.imageUrl || null,
            videoUrl: libraryExercise.videoUrl || null,
          };
        }),
      };
    });

    const scheduled = applyContractScheduleToWorkouts(
      normalizedWorkouts,
      contractedDays,
      effectiveExpectedContext.weekStart,
      effectiveExpectedContext.expectedWorkoutDates
    );

    return {
      source: "ai-summary",
      createdAt: new Date().toISOString(),
      studentId: payloadStudentId,
      studentName: payload?.studentName || effectiveStudent?.name || "",
      editingWorkoutId: targetWorkoutId || null,
      aiValidation: effectiveExpectedContext,
      evolutionDecision,
      currentIndex: 0,
      scheduleDescription: scheduled.scheduleDescription,
      scheduleWarning: scheduled.scheduleWarning,
      workouts: scheduled.workouts,
    };
  }

  async function openJsonInWorkoutBuilder() {
    const importedText = aiJsonText;

    if (!importedText.trim()) {
      setAiImportMessage({ type: "error", text: "Importe ou cole primeiro a resposta TXT/JSON da IA." });
      return;
    }

    try {
      // Primeiro lemos o arquivo importado e identificamos o aluno/semana do próprio
      // pacote. Isso evita que uma URL antiga ou uma seleção visual desatualizada
      // faça o JSON desaparecer sem abrir a montagem.
      const parsed = extractJsonFromText(importedText);
      const importedStudentId = String(parsed?.studentId || "").trim();
      const importedValidation = parsed?.aiValidation || parsed?.security || null;
      const importedWeekStart = String(importedValidation?.weekStart || targetWeekStart || "").trim();

      if (!importedStudentId) {
        throw new Error("O arquivo importado não possui studentId.");
      }

      const importedStudent = students.find((student) => student.id === importedStudentId) || null;
      if (!importedStudent) {
        throw new Error("O aluno deste arquivo não foi encontrado entre os alunos disponíveis para o professor.");
      }

      if (targetWorkoutId && importedStudentId !== selectedStudentId) {
        throw new Error("Este arquivo pertence a outro aluno e não pode substituir o treino que está sendo editado.");
      }

      // Se o professor importou um arquivo válido de outro aluno enquanto a URL
      // ainda apontava para um aluno anterior, sincronizamos a seleção automaticamente.
      if (!targetWorkoutId && importedStudentId !== selectedStudentId) {
        setSelectedStudentId(importedStudentId);
        setSummary(null);

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("studentId", importedStudentId);
          if (importedWeekStart) url.searchParams.set("date", importedWeekStart);
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }

      // Reconsulta a programação oficial sem apagar o JSON que acabou de ser importado.
      const careReturnRemainingDates = await resolveCareReturnPlanningTarget(
        importedStudentId,
        importedWeekStart || undefined,
        true
      );
      const authoritativeExpectedDatesRaw =
        careReturnRemainingDates !== null
          ? careReturnRemainingDates
          : targetExpectedWorkoutDates;
      const effectiveWeekStart = importedWeekStart || targetWeekStart || resolveWeekStartIso(getSaoPauloCivilDateInput());
      const authoritativeExpectedDates = targetWorkoutId
        ? authoritativeExpectedDatesRaw
        : normalizeCurrentWeekExpectedDatesFallback(
            authoritativeExpectedDatesRaw,
            effectiveWeekStart
          );

      if (careReturnRemainingDates && careReturnRemainingDates.length === 0) {
        setAiImportMessage({
          type: "success",
          text: "A programação desta semana já está completa. Não há treino restante para importar.",
        });
        return;
      }

      const normalized = normalizeAiWorkoutPayload(
        parsed,
        authoritativeExpectedDates,
        importedStudentId
      );

      localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(normalized));
      setAiImportMessage({
        type: "success",
        text: targetWorkoutId
          ? "JSON validado. Abrindo o treino existente para substituição dos dados."
          : `JSON validado para ${importedStudent.name}. Abrindo a montagem do treino.`,
      });

      const firstWorkoutDate = normalized.aiValidation.expectedWorkoutDates?.[0] || normalized.aiValidation.weekStart;
      window.location.href = `/dashboard/montar-treino?studentId=${encodeURIComponent(normalized.studentId)}&date=${encodeURIComponent(firstWorkoutDate)}&source=ai-json${targetWorkoutId ? `&workoutId=${encodeURIComponent(targetWorkoutId)}` : ""}`;
    } catch (error: any) {
      // Nunca apaga o arquivo importado quando há erro: o professor consegue ver
      // o motivo, corrigir e tentar novamente sem reimportar tudo.
      setAiJsonText(importedText);
      setAiImportMessage({
        type: "error",
        text: error?.message || "JSON inválido. Importe novamente a resposta da IA.",
      });
    }
  }

  function selectPromptLibraryFor(summaryData: SummaryResponse, studentNameForSearch: string): LibraryExercise[] {
    const consolidatedContext = buildConsolidatedTrainingContext(summaryData);
    const context = normalizePromptSearch(
      [
        summaryData.summaryText,
        JSON.stringify(consolidatedContext),
        studentNameForSearch,
        summaryData.evolutionContext?.reason,
      ]
        .filter(Boolean)
        .join(" ")
    );

    const stopWords = new Set([
      "aluno", "treino", "treinos", "para", "com", "sem", "mais", "uma", "como",
      "objetivo", "objetivos", "professor", "semana", "atual", "dados", "informacao",
      "informacoes", "deve", "fazer", "realizar", "geral", "atividade", "fisica",
    ]);
    const terms = Array.from(new Set(
      context.split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !stopWords.has(term))
    )).slice(0, 50);

    const boosts: string[] = [];
    if (context.includes("corrida")) boosts.push("corrida", "pernas", "gluteos", "panturrilha", "core", "quadril", "tornozelo");
    if (context.includes("academia")) boosts.push("academia", "maquina", "halteres", "polia");
    if (context.includes("casa")) boosts.push("casa", "peso corporal", "nenhum equipamento", "elastico");
    if (context.includes("emagrec")) boosts.push("condicionamento", "corpo inteiro", "cardio");
    if (context.includes("hipertrof") || context.includes("massa muscular")) boosts.push("hipertrofia", "fortalecimento", "halteres", "maquinas");
    if (context.includes("mobilidade")) boosts.push("mobilidade", "alongamento");

    const wantsGymMachines =
      context.includes("academia") &&
      /(maquina|maquinas|leg press|cadeira extensora|cadeira flexora|polia|puxada|remada)/.test(context);

    // Modo lote sempre monta treino novo (nunca substitui um treino específico
    // em edição), então exercícios inativos ficam de fora, igual ao fluxo padrão.
    const eligibleLibrary = exerciseLibrary.filter((exercise) => exercise.active !== false);

    const scored = eligibleLibrary
      .map((exercise, index) => {
        const searchable = normalizePromptSearch([
          exercise.name, exercise.muscleGroup, exercise.objectiveTags, exercise.locationTags,
          exercise.equipmentTags, exercise.levelTags, exercise.intensity,
        ].join(" "));
        let score = 0;
        for (const term of terms) if (searchable.includes(term)) score += term.length >= 7 ? 5 : 3;
        for (const boost of boosts) if (searchable.includes(boost)) score += 10;

        const isMachineBased = /(maquina|maquinas|leg press|cadeira (extensora|flexora|abdutora|adutora)|polia|puxada|remada baixa|chest press|smith|barra guiada)/.test(searchable);
        if (wantsGymMachines && isMachineBased) score += 60;

        return { exercise, score, index, isMachineBased };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!wantsGymMachines) {
      return scored.slice(0, 32).map((item) => item.exercise);
    }

    const machineFirst = scored.filter((item) => item.isMachineBased).slice(0, 18);
    const selectedIds = new Set(machineFirst.map((item) => item.exercise.id));
    const complementary = scored
      .filter((item) => !selectedIds.has(item.exercise.id))
      .slice(0, Math.max(32 - machineFirst.length, 0));

    return [...machineFirst, ...complementary].slice(0, 32).map((item) => item.exercise);
  }

  function getExerciseLibraryPromptLinesFor(summaryData: SummaryResponse, studentNameForSearch: string): string[] {
    if (exerciseLibrary.length === 0) {
      return [
        "BIBLIOTECA PERMITIDA: []",
        "Não gere treino enquanto a biblioteca estiver vazia.",
      ];
    }

    const selected = selectPromptLibraryFor(summaryData, studentNameForSearch);
    const compactLibrary = selected.map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      group: exercise.muscleGroup || undefined,
      location: compactText(exercise.locationTags) || undefined,
      equipment: compactText(exercise.equipmentTags) || undefined,
      intensity: compactText(exercise.intensity) || undefined,
    }));

    return [
      `BIBLIOTECA PERMITIDA (${compactLibrary.length} opções já filtradas pelo sistema): ${JSON.stringify(compactLibrary)}`,
      "Use somente esses exerciseId. O sistema completará descrição, execução e segurança a partir do cadastro oficial.",
    ];
  }

  function getBatchStudentPromptBlock(
    index: number,
    summaryData: SummaryResponse,
    student: { id: string; name: string; contractedTrainingDaysPerMonth?: number | null },
    weekStart: string,
    expectedWorkoutDates: string[]
  ): string {
    const validationContext = getAiValidationContext({
      studentId: student.id,
      contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
      weekStartIso: weekStart,
      expectedWorkoutDatesOverride: expectedWorkoutDates,
    });
    const schedule = validationContext.expectedWorkoutDates.length > 0
      ? getTrainingScheduleFromExpectedDates(validationContext.expectedWorkoutDates)
      : getTrainingSchedule(student.contractedTrainingDaysPerMonth, validationContext.weekStart);
    const scheduleDescription = getTrainingScheduleDescription(student.contractedTrainingDaysPerMonth);
    const expectedWorkoutCount = validationContext.expectedWorkoutCount;
    const evolution = summaryData.evolutionContext || {};
    const validationPayload = {
      studentId: validationContext.studentId,
      weekStart: validationContext.weekStart,
      weekEnd: validationContext.weekEnd,
      expectedWorkoutCount: validationContext.expectedWorkoutCount,
      expectedWorkoutDates: validationContext.expectedWorkoutDates,
      validationKey: validationContext.validationKey,
    };
    const compactContext = getCompactStudentContext(summaryData);
    const consolidatedContext = buildConsolidatedTrainingContext(summaryData);

    return [
      `=== ALUNO ${index + 1}: ${student.name} | studentId=${student.id} ===`,
      `SEMANA E VALIDAÇÃO IMUTÁVEL: ${JSON.stringify(validationPayload)}`,
      `CALENDÁRIO DO CONTRATO: ${scheduleDescription} Nesta solicitação, gere somente ${expectedWorkoutCount} treino(s) restante(s), nas datas obrigatórias: ${validationContext.expectedWorkoutDates.join(", ") || "não configuradas"}.`,
      `DECISÃO PRÉVIA DO SISTEMA: ${JSON.stringify({
        status: evolution.status || "PRE_PLANEJAMENTO_CONSERVADOR",
        reason: evolution.reason || "Revisar contexto antes da liberação.",
        alerts: evolution.reviewAlerts || [],
      })}`,
      `CONTEXTO CONSOLIDADO E PRECEDÊNCIA: ${JSON.stringify(consolidatedContext)}`,
      `DÚVIDAS/FEEDBACKS ABERTOS DO ALUNO — CONTEXTO OBRIGATÓRIO: ${JSON.stringify(summaryData.openQuestions || [])}`,
      `CONTEXTO ESSENCIAL DO ALUNO: ${compactContext}`,
      ...getExerciseLibraryPromptLinesFor(summaryData, student.name),
      `FORMATO PARA ESTE ALUNO DENTRO DE "results": {"studentId":"${student.id}","studentName":"${student.name.replaceAll('"', "'")}","aiValidation":${JSON.stringify(validationPayload)},"evolutionDecision":{"status":"PRE_PLANEJAMENTO_CONSERVADOR","reason":"motivo objetivo","requiresReviewBeforeRelease":true,"reviewAlerts":[]},"workouts":[{"name":"Treino A","date":"${schedule[0]?.date || "AAAA-MM-DD"}","description":"","objective":"","focusAreas":"","intensity":"leve|moderada|alta","estimatedDurationMinutes":40,"estimatedCaloriesMin":0,"estimatedCaloriesMax":0,"studentSummary":"","safetyNote":"","notes":"","exercises":[{"exerciseId":"ID_DA_BIBLIOTECA","series":3,"reps":"10-12","weight":"a definir pelo professor","restTime":"60s","notes":"","order":0}]}]} — gerar exatamente ${expectedWorkoutCount} treino(s) para este aluno.`,
      "",
    ].join("\n");
  }

  function getBatchJsonPrompt(
    entries: Array<{
      summaryData: SummaryResponse;
      student: { id: string; name: string; contractedTrainingDaysPerMonth?: number | null };
      weekStart: string;
      expectedWorkoutDates: string[];
    }>
  ): string {
    const blockedEntries = entries.filter((entry) => hasOpenCarePause(entry.summaryData));

    const header = [
      ...MANUAL_AI_EXECUTION_HEADER_LINES,
      `Monte os treinos da semana para ${entries.length} aluno(s) diferentes, um bloco por aluno, apoiando o professor de educação física.`,
      "Responda somente com JSON válido, sem markdown, comentários ou explicações.",
      "Use somente exerciseId da biblioteca permitida de CADA aluno (a biblioteca é filtrada por aluno). Não invente exercícios, cargas, equipamentos, lesões, restrições ou diagnósticos.",
      "Respeite objetivo, local, equipamentos, preferências, adesão, histórico e cuidados de cada aluno individualmente. Dor/desconforto impede progressão automática e exige revisão humana.",
      "Cada bloco de aluno abaixo é independente: não misture contexto, biblioteca ou exercícios de um aluno com outro.",
      "Se os dados de um aluno forem insuficientes ou a adesão estiver baixa, faça planejamento conservador para aquele aluno e sinalize isso em evolutionDecision.",
      "NÃO recuse gerar o treino de um aluno por conflito entre cadastro antigo e memória técnica. Use a memória APPROVED mais recente e registre o conflito em reviewAlerts.",
      "Só deixe de gerar o treino de um aluno quando houver pausa por cuidado aberta, biblioteca vazia ou validação imutável inválida para aquele aluno — nesse caso, simplesmente não inclua esse aluno em results.",
      "Calorias são faixa estimada e conservadora, nunca promessa. O professor revisará antes de liberar.",
      "",
    ];

    const blockedNote = blockedEntries.length > 0
      ? [
          `ALUNOS COM PAUSA POR CUIDADO ABERTA — NÃO GERAR TREINO PARA ESTES: ${blockedEntries.map((entry) => entry.student.name).join(", ")}.`,
          "",
        ]
      : [];

    const studentBlocks = entries
      .filter((entry) => !hasOpenCarePause(entry.summaryData))
      .map((entry, index) =>
        getBatchStudentPromptBlock(index, entry.summaryData, entry.student, entry.weekStart, entry.expectedWorkoutDates)
      );

    const footer = [
      "",
      "FORMATO OBRIGATÓRIO DA RESPOSTA COMPLETA:",
      `{"results":[ /* um objeto por aluno, no formato indicado em cada bloco "ALUNO N" acima, na mesma ordem */ ]}`,
      "Não inclua nenhum aluno bloqueado por pausa de cuidado em results. Mantenha aiValidation de cada aluno exatamente como foi informado, sem qualquer alteração.",
    ];

    return [...header, ...blockedNote, ...studentBlocks, ...footer].join("\n");
  }

  function getBatchWeekStart(): string {
    return targetWeekStart || resolveWeekStartIso(getSaoPauloCivilDateInput());
  }

  async function loadBatchEligibleStudents() {
    setBatchLoadingEligible(true);
    setBatchMessage(null);

    try {
      const weekStart = getBatchWeekStart();
      const CONCURRENCY = 8;
      const eligible: string[] = [];
      const pool = [...students];

      async function worker() {
        while (pool.length > 0) {
          const student = pool.shift();
          if (!student) return;

          const dates = await fetchAuthoritativeExpectedWorkoutDates(student.id, weekStart, student);
          if (dates && dates.length > 0) eligible.push(student.id);
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, students.length || 1) }, worker));

      setBatchEligibleIds(eligible);
      setBatchSelectedIds((current) => current.filter((id) => eligible.includes(id)));

      if (eligible.length === 0) {
        setBatchMessage({ type: "warning", text: "Nenhum aluno com treino pendente nesta semana no momento." });
      }
    } catch {
      setBatchMessage({ type: "error", text: "Erro ao verificar quais alunos precisam de treino." });
    }

    setBatchLoadingEligible(false);
  }

  function toggleBatchStudent(studentId: string) {
    setBatchSelectedIds((current) => {
      if (current.includes(studentId)) {
        return current.filter((id) => id !== studentId);
      }

      if (current.length >= Math.max(Number(batchSize) || 1, 1)) {
        return current;
      }

      return [...current, studentId];
    });
  }

  async function generateBatchPackage() {
    if (batchSelectedIds.length === 0) {
      setBatchMessage({ type: "warning", text: "Selecione ao menos um aluno para o pacote." });
      return;
    }

    if (exerciseLibrary.length === 0) {
      setBatchMessage({ type: "error", text: "A biblioteca de exercícios está vazia." });
      return;
    }

    setBatchGenerating(true);
    setBatchMessage(null);
    setBatchResults([]);

    try {
      const weekStart = getBatchWeekStart();
      const entries: Array<{
        summaryData: SummaryResponse;
        student: { id: string; name: string; contractedTrainingDaysPerMonth?: number | null };
        weekStart: string;
        expectedWorkoutDates: string[];
      }> = [];

      for (const studentId of batchSelectedIds) {
        const student = students.find((item) => item.id === studentId);
        if (!student) continue;

        const [summaryRes, expectedWorkoutDates] = await Promise.all([
          fetch(`/api/students/${studentId}/ai-summary`, { cache: "no-store" }),
          fetchAuthoritativeExpectedWorkoutDates(studentId, weekStart, student),
        ]);

        if (!summaryRes.ok) {
          throw new Error(`Não foi possível gerar o resumo de ${student.name}.`);
        }

        const summaryData = (await summaryRes.json()) as SummaryResponse;

        entries.push({
          summaryData,
          student,
          weekStart,
          expectedWorkoutDates: expectedWorkoutDates || [],
        });
      }

      if (entries.length === 0) {
        setBatchMessage({ type: "error", text: "Nenhum aluno válido para gerar o pacote." });
        return;
      }

      const prompt = getBatchJsonPrompt(entries);
      setBatchPrompt(prompt);

      const zip = new JSZip();
      zip.file(
        "INSTRUCOES/LEIA_PRIMEIRO.txt",
        [
          "EXECUÇÃO DIRETA — LEIA E EXECUTE O prompt.txt.",
          `Este pacote cobre ${entries.length} aluno(s): ${entries.map((entry) => entry.student.name).join(", ")}.`,
          "A resposta deve ser um único JSON no formato {\"results\":[...]}, com um item por aluno, na mesma ordem dos blocos do prompt.",
          "Salve o resultado em resposta.txt e importe de volta no sistema.",
        ].join("\n")
      );
      zip.file("prompt.txt", prompt);

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pacote-lote-treinos-${weekStart}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBatchMessage({ type: "success", text: `Pacote gerado para ${entries.length} aluno(s). Envie para a IA e importe a resposta abaixo.` });
    } catch (error: any) {
      setBatchMessage({ type: "error", text: error?.message || "Erro ao gerar o pacote do lote." });
    }

    setBatchGenerating(false);
  }

  function openBatchDraftInWorkoutBuilder(result: BatchStudentResult) {
    if (!result.draft) return;

    localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(result.draft));

    const aiValidation = result.draft.aiValidation as { expectedWorkoutDates?: string[]; weekStart?: string } | undefined;
    const firstWorkoutDate = aiValidation?.expectedWorkoutDates?.[0] || aiValidation?.weekStart || "";

    window.location.href = `/dashboard/montar-treino?studentId=${encodeURIComponent(result.studentId)}&date=${encodeURIComponent(firstWorkoutDate)}&source=ai-json`;
  }

  async function importBatchResponse() {
    if (!batchJsonText.trim()) {
      setBatchMessage({ type: "error", text: "Cole a resposta da IA para o lote." });
      return;
    }

    setBatchImporting(true);
    setBatchMessage(null);

    try {
      const parsed = extractJsonFromText(batchJsonText);
      const items = Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed)
          ? parsed
          : null;

      if (!items) {
        throw new Error('A resposta precisa ser um JSON no formato {"results":[...]}.');
      }

      const weekStart = getBatchWeekStart();
      const results: BatchStudentResult[] = [];

      for (const item of items) {
        const studentId = String(item?.studentId || "").trim();
        const student = students.find((candidate) => candidate.id === studentId);
        const studentName = item?.studentName || student?.name || studentId || "Aluno não identificado";

        try {
          if (!student) {
            throw new Error("Aluno não encontrado entre os alunos disponíveis para o professor.");
          }

          const expectedWorkoutDates = await fetchAuthoritativeExpectedWorkoutDates(studentId, weekStart, student);

          if (expectedWorkoutDates && expectedWorkoutDates.length === 0) {
            throw new Error("A programação desta semana já está completa para este aluno. Nada a importar.");
          }

          const normalized = normalizeAiWorkoutPayload(item, expectedWorkoutDates || undefined, studentId);

          results.push({
            studentId,
            studentName: student.name,
            status: "pronto",
            draft: normalized,
          });
        } catch (error: any) {
          results.push({
            studentId: studentId || `sem-id-${results.length}`,
            studentName,
            status: "erro",
            error: error?.message || "Erro ao validar este aluno.",
          });
        }
      }

      setBatchResults(results);

      const readyCount = results.filter((result) => result.status === "pronto").length;
      setBatchMessage({
        type: readyCount > 0 ? "success" : "error",
        text: `${readyCount} de ${results.length} aluno(s) validado(s) e prontos para revisão.`,
      });
    } catch (error: any) {
      setBatchMessage({ type: "error", text: error?.message || "JSON inválido. Importe novamente a resposta da IA." });
    }

    setBatchImporting(false);
  }

  async function resolveCareReturnPlanningTarget(
    studentId: string,
    referenceDateOverride?: string,
    preserveAiJson = false
  ): Promise<string[] | null> {
    if (!studentId || targetWorkoutId) return null;

    const referenceDate = referenceDateOverride || targetWeekStart || resolveWeekStartIso(getSaoPauloCivilDateInput());

    try {
      const res = await fetch(
        `/api/workout-plan?studentId=${encodeURIComponent(studentId)}&date=${encodeURIComponent(referenceDate)}&summary=1`,
        { cache: "no-store" }
      );

      if (!res.ok) return null;

      const data = (await res.json()) as WorkoutPlanningSummaryResponse;
      const weeklyLimit = Math.max(Number(data.weeklyLimit || 0), 0);

      if (!weeklyLimit) return null;

      // A API é a fonte única da programação semanal. Ela já considera:
      // contrato ativo, treinos realmente salvos, retomada no meio da semana
      // e o fato de datas passadas não poderem voltar para uma nova montagem.
      if (Array.isArray(data.expectedWorkoutDates)) {
        const authoritativeDates = data.expectedWorkoutDates
          .map((value) => String(value))
          .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

        setTargetExpectedWorkoutDates(authoritativeDates);
        if (!preserveAiJson) {
          setAiJsonText("");
          setAiImportMessage(null);
        }
        setMessage(null);

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("studentId", studentId);

          if (authoritativeDates.length > 0) {
            url.searchParams.set("date", authoritativeDates[0]);
            url.searchParams.set("expectedWorkoutDates", authoritativeDates.join(","));
          } else {
            url.searchParams.delete("expectedWorkoutDates");
          }

          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        }

        return authoritativeDates;
      }

      const createdDates = new Set(
        (Array.isArray(data.plans) ? data.plans : [])
          .map((plan) => getCivilDateInput(plan.date || plan.createdAt || null))
          .filter((value): value is string => Boolean(value))
      );

      const remainingCount = Number.isFinite(Number(data.weeklyRemaining))
        ? Math.max(Number(data.weeklyRemaining || 0), 0)
        : Math.max(weeklyLimit - createdDates.size, 0);

      if (remainingCount <= 0) {
        setTargetExpectedWorkoutDates([]);
        if (!preserveAiJson) {
          setAiJsonText("");
          setAiImportMessage(null);
        }

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("expectedWorkoutDates");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        }

        return [];
      }

      const weekStartIso = resolveWeekStartIso(referenceDate);
      const weekStartDate = parseDateInput(weekStartIso);
      if (!weekStartDate) return null;

      const sundayIso = formatIsoDate(addDays(weekStartDate, 6));
      const todayIso = getSaoPauloCivilDateInput();
      const currentWeekStartIso = resolveWeekStartIso(todayIso);
      const isCurrentWeek = currentWeekStartIso === weekStartIso;
      const planningStart =
        getCivilDateInput(data.careReturn?.planningStart || data.effectivePlanningStart || weekStartIso) ||
        weekStartIso;
      const earliestAllowedDate = isCurrentWeek && todayIso > planningStart
        ? todayIso
        : planningStart;

      if (earliestAllowedDate > sundayIso) {
        setTargetExpectedWorkoutDates([]);
        return [];
      }

      const planningStudent = students.find((student) => student.id === studentId) || selectedStudent;
      const contractedDays = planningStudent?.contractedTrainingDaysPerMonth || weeklyLimit * 4;
      const canonicalDates = getTrainingSchedule(
        contractedDays,
        weekStartIso,
        planningStudent?.preferredWorkoutDays
      )
        .map((item) => item.date)
        .filter(
          (date) =>
            date >= earliestAllowedDate &&
            date <= sundayIso &&
            !createdDates.has(date)
        );

      const weekdayFallbackDates: string[] = [];
      const hasStructuredPreferredWorkoutDays = Boolean(
        planningStudent?.preferredWorkoutDays?.length
      );
      const cursor = parseDateInput(earliestAllowedDate);

      // Alunos com rotina estruturada nunca recebem compensação em um dia não escolhido.
      // O fallback diário fica somente para cadastros antigos sem preferência estruturada.
      if (cursor && !hasStructuredPreferredWorkoutDays) {
        while (formatIsoDate(cursor) <= sundayIso) {
          const date = formatIsoDate(cursor);

          if (
            !createdDates.has(date) &&
            !canonicalDates.includes(date)
          ) {
            weekdayFallbackDates.push(date);
          }

          cursor.setDate(cursor.getDate() + 1);
        }
      }

      const remainingDates = [...canonicalDates, ...weekdayFallbackDates]
        .slice(0, remainingCount)
        .sort();

      // Fonte única para qualquer semana corrente: o que já foi salvo no banco
      // conta primeiro; datas antigas que ficaram para trás não voltam a ser
      // oferecidas. Na retomada do meio da semana, isso transforma 05/08 criado
      // + 1 restante em 07/08, em vez de reabrir 03/08.
      setTargetExpectedWorkoutDates(remainingDates);
      if (!preserveAiJson) {
        setAiJsonText("");
        setAiImportMessage(null);
      }
      setMessage(null);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (remainingDates.length > 0) {
          url.searchParams.set("date", remainingDates[0]);
          url.searchParams.set("expectedWorkoutDates", remainingDates.join(","));
        } else {
          url.searchParams.delete("expectedWorkoutDates");
        }
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }

      return remainingDates;
    } catch {
      const localFallback = normalizeCurrentWeekExpectedDatesFallback(
        targetExpectedWorkoutDates,
        targetWeekStart || resolveWeekStartIso(getSaoPauloCivilDateInput())
      );

      if (localFallback.length > 0) {
        setTargetExpectedWorkoutDates(localFallback);
        return localFallback;
      }

      return null;
    }
  }

  async function generateSummary() {
    if (!selectedStudentId) {
      setMessage({ type: "error", text: "Selecione um aluno." });
      return;
    }

    if (selectedStudentMissingBirthDate) {
      setMessage({
        type: "error",
        text: "Data de nascimento não informada. A gestão precisa completar o cadastro antes de gerar o resumo IA.",
      });
      return;
    }

    if (!loadingExerciseLibrary && exerciseLibrary.length === 0) {
      setMessage({
        type: "error",
        text: "A biblioteca de exercícios está vazia. Cadastre exercícios antes de gerar treino por IA.",
      });
      return;
    }

    setLoadingSummary(true);
    setMessage(null);
    setSummary(null);

    try {
      const careReturnRemainingDates = await resolveCareReturnPlanningTarget(selectedStudentId);

      if (careReturnRemainingDates && careReturnRemainingDates.length === 0) {
        setMessage({
          type: "success",
          text: "A programação de retomada desta semana já está completa. Não há novo treino pendente para gerar por IA.",
        });
        setLoadingSummary(false);
        return;
      }

      const res = await fetch(`/api/students/${selectedStudentId}/ai-summary`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        const openQuestions = await loadOpenQuestionsContext(selectedStudentId);
        const enrichedData: SummaryResponse = {
          ...data,
          openQuestions,
        };
        const openQuestionsCount = Math.max(
          openQuestions.length,
          Number(data?.metrics?.openQuestions || 0)
        );

        setSummary(enrichedData);
        setViewMode("jsonPrompt");

        if (hasOpenCarePause(enrichedData)) {
          setMessage({
            type: "error",
            text: "Resumo gerado, mas o aluno está em pausa por cuidado. Não gere JSON de treino normal enquanto o evento estiver aberto.",
          });
        } else if (openQuestionsCount > 0) {
          setMessage({
            type: "warning",
            text: `Resumo gerado. Há ${openQuestionsCount} mensagem(ns) do aluno aguardando resposta. O conteúdo foi incluído no contexto da IA e deve orientar os ajustes do treino. Você pode gerar o pacote normalmente, mas revise o resultado e responda ao aluno antes da liberação final.`,
          });
        } else {
          setMessage({ type: "success", text: "Resumo gerado com sucesso." });
        }
      } else {
        setMessage({ type: "error", text: data?.error || "Erro ao gerar resumo." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao gerar resumo." });
    }

    setLoadingSummary(false);
  }


  async function downloadAiPackage() {
    if (!summary) return;

    if (hasOpenCarePause(summary)) {
      setMessage({
        type: "error",
        text: "Aluno em pausa por cuidado. O pacote de treino não pode ser gerado enquanto o evento estiver aberto.",
      });
      return;
    }

    try {
      const careReturnRemainingDates = selectedStudentId
        ? await resolveCareReturnPlanningTarget(selectedStudentId)
        : null;
      const authoritativeExpectedDatesRaw =
        careReturnRemainingDates !== null
          ? careReturnRemainingDates
          : targetExpectedWorkoutDates;
      const authoritativeExpectedDates = targetWorkoutId
        ? authoritativeExpectedDatesRaw
        : normalizeCurrentWeekExpectedDatesFallback(
            authoritativeExpectedDatesRaw,
            targetWeekStart || resolveWeekStartIso(getSaoPauloCivilDateInput())
          );

      if (careReturnRemainingDates && careReturnRemainingDates.length === 0) {
        setMessage({
          type: "success",
          text: "A programação de retomada desta semana já está completa. Não há novo pacote para gerar.",
        });
        return;
      }

      const packageSchedule = authoritativeExpectedDates.length > 0
        ? getTrainingScheduleFromExpectedDates(authoritativeExpectedDates)
        : displaySchedule;

      // Reconsulta as conversas abertas exatamente no momento de baixar o ZIP.
      // Isso garante que uma mensagem enviada depois de gerar o resumo também
      // entre no pacote e que DUVIDAS_ABERTAS.json nunca dependa de estado antigo.
      const freshOpenQuestions = selectedStudentId
        ? await loadOpenQuestionsContext(selectedStudentId)
        : [];
      const packageOpenQuestions = freshOpenQuestions.length > 0
        ? freshOpenQuestions
        : (summary.openQuestions || []);
      const summaryForPackage: SummaryResponse = {
        ...summary,
        openQuestions: packageOpenQuestions,
      };

      const consolidatedContext = buildConsolidatedTrainingContext(summaryForPackage);
      const consolidatedSummaryText = buildConsolidatedSummaryText(summaryForPackage, consolidatedContext);
      const packageSummary: SummaryResponse = {
        ...summaryForPackage,
        summaryText: consolidatedSummaryText,
      };
      const prompt = getJsonPrompt(packageSummary, authoritativeExpectedDates);
      const zip = new JSZip();
      const safeStudentName = summary.student.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "aluno";
      const model = {
        studentId: summary.student.id,
        studentName: summary.student.name,
        ...(targetWorkoutId ? { workoutId: targetWorkoutId, mode: "EDIT_EXISTING_WORKOUT" } : {}),
        aiValidation: {
          studentId: summary.student.id,
          weekStart: displayWeekStart,
          weekEnd: displayWeekEnd,
          expectedWorkoutCount: packageSchedule.length,
          expectedWorkoutDates: packageSchedule.map((item) => item.date),
          validationKey: [
            "FVD",
            summary.student.id,
            displayWeekStart,
            String(packageSchedule.length),
            packageSchedule.map((item) => item.date).join("_"),
          ].join("|"),
        },
        evolutionDecision: {
          status: "PRE_PLANEJAMENTO_CONSERVADOR",
          reason: "motivo objetivo",
          requiresReviewBeforeRelease: true,
          reviewAlerts: [],
        },
        workouts: [],
      };
      const manifest = {
        packageVersion: "2.2-open-questions",
        purpose: targetWorkoutId ? "ALTERAR_TREINO_EXISTENTE" : "MONTAR_TREINOS_DA_SEMANA",
        generatedAt: new Date().toISOString(),
        studentId: summary.student.id,
        studentName: summary.student.name,
        ...(targetWorkoutId ? { workoutId: targetWorkoutId } : {}),
        weekStart: displayWeekStart,
        weekEnd: displayWeekEnd,
        expectedWorkoutDates: packageSchedule.map((item) => item.date),
        files: [
          "INSTRUCOES/LEIA_PRIMEIRO.txt",
          "INSTRUCOES/MODELO_RESPOSTA.json",
          "INSTRUCOES/RESPOSTA_AQUI.txt",
          "prompt.txt",
          "CONTEXTO/CONTEXTO_CONSOLIDADO.json",
          "CONTEXTO/CONFLITOS_RESOLVIDOS.json",
          "CONTEXTO/RESUMO_ALUNO.txt",
          "CONTEXTO/MEMORIA_TECNICA.json",
          "CONTEXTO/HISTORICO_RECENTE.json",
          "CONTEXTO/PREFERENCIAS_ATIVAS.json",
          "CONTEXTO/EVENTOS_DE_CUIDADO.json",
          "CONTEXTO/DUVIDAS_ABERTAS.json",
          "CONTEXTO/ULTIMO_TREINO.json",
          "CONTEXTO/BIBLIOTECA_EXERCICIOS.json",
          "manifesto.json",
        ],
      };

      zip.file(
        "INSTRUCOES/LEIA_PRIMEIRO.txt",
        [
          "EXECUÇÃO DIRETA — LEIA E EXECUTE O prompt.txt.",
          "Analise todos os arquivos da pasta CONTEXTO antes de montar os treinos.",
          "Leia primeiro CONTEXTO/CONTEXTO_CONSOLIDADO.json.",
          "A memória técnica APPROVED mais recente prevalece sobre cadastro/onboarding antigo quando houver conflito.",
          "Não recuse gerar treino apenas por conflito de dados: aplique a precedência, gere de forma conservadora e inclua o alerta para revisão humana.",
          "A memória técnica aprovada, os eventos de cuidado e os feedbacks recentes têm prioridade sobre suposições.",
          "Leia CONTEXTO/DUVIDAS_ABERTAS.json. Mensagens abertas do aluno são contexto obrigatório para ajustar o treino, mesmo antes de o professor responder. Elas não bloqueiam a geração por si só; o professor deve revisar e responder antes da liberação final.",
          "Não trate um achado isolado como autorização automática para progressão.",
          "Retorne somente o JSON válido no formato de INSTRUCOES/MODELO_RESPOSTA.json.",
          "Não altere studentId, aiValidation, datas obrigatórias ou validationKey.",
          targetWorkoutId
            ? `Este pacote é de ALTERAÇÃO do treino existente workoutId=${targetWorkoutId}. Gere somente a data indicada e não crie outro treino.`
            : "Este pacote é de montagem dos treinos faltantes da semana.",
          "Use somente exerciseId presentes na biblioteca permitida.",
          "Quando possível, salve o resultado em resposta.txt.",
        ].join("\n")
      );
      zip.file("INSTRUCOES/MODELO_RESPOSTA.json", JSON.stringify(model, null, 2));
      zip.file(
        "INSTRUCOES/RESPOSTA_AQUI.txt",
        "Cole aqui somente o JSON final produzido pela IA e depois importe este TXT no Funcional UP Digital."
      );
      zip.file("prompt.txt", prompt);
      zip.file("CONTEXTO/CONTEXTO_CONSOLIDADO.json", JSON.stringify(consolidatedContext, null, 2));
      zip.file("CONTEXTO/CONFLITOS_RESOLVIDOS.json", JSON.stringify(consolidatedContext.conflictsResolved || [], null, 2));
      zip.file("CONTEXTO/RESUMO_ALUNO.txt", consolidatedSummaryText);
      const technicalContext = summary.technicalContext || {};
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
        JSON.stringify(technicalContext.activePreferences || [], null, 2)
      );
      zip.file(
        "CONTEXTO/EVENTOS_DE_CUIDADO.json",
        JSON.stringify(technicalContext.openCareEvents || [], null, 2)
      );
      zip.file(
        "CONTEXTO/DUVIDAS_ABERTAS.json",
        JSON.stringify(packageOpenQuestions, null, 2)
      );
      zip.file(
        "CONTEXTO/ULTIMO_TREINO.json",
        JSON.stringify(summary.latestWorkout || null, null, 2)
      );
      zip.file(
        "CONTEXTO/BIBLIOTECA_EXERCICIOS.json",
        JSON.stringify(selectPromptLibrary(summary).map((exercise) => ({
          exerciseId: exercise.id,
          name: exercise.name,
          group: exercise.muscleGroup,
          location: exercise.locationTags,
          equipment: exercise.equipmentTags,
          intensity: exercise.intensity,
        })), null, 2)
      );
      zip.file("manifesto.json", JSON.stringify(manifest, null, 2));

      // Trava de integridade do pacote: se este arquivo não tiver sido criado,
      // interrompe o download em vez de entregar um ZIP incompleto.
      if (!zip.file("CONTEXTO/DUVIDAS_ABERTAS.json")) {
        throw new Error("Falha interna: DUVIDAS_ABERTAS.json não foi incluído no pacote.");
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = targetWorkoutId
        ? `pacote-alterar-treino-${safeStudentName}-${packageSchedule[0]?.date || displayWeekStart}.zip`
        : `pacote-montar-treino-${safeStudentName}-${displayWeekStart}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Pacote ZIP gerado. Envie o arquivo para a IA externa e depois importe o TXT retornado." });
    } catch (error) {
      console.error("Erro ao gerar pacote de treino:", error);
      setMessage({ type: "error", text: "Não foi possível gerar o pacote ZIP para a IA." });
    }
  }

  async function importAiResponseFile(file?: File | null) {
    if (!file) return;

    try {
      const text = await file.text();
      setAiJsonText(text);

      let importedStudentName = "";
      try {
        const parsed = extractJsonFromText(text);
        const importedStudentId = String(parsed?.studentId || "").trim();
        const importedStudent = students.find((student) => student.id === importedStudentId) || null;
        importedStudentName = importedStudent?.name || String(parsed?.studentName || "").trim();

        if (importedStudent && !targetWorkoutId && importedStudentId !== selectedStudentId) {
          setSelectedStudentId(importedStudentId);
          setSummary(null);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("studentId", importedStudentId);
            const importedWeekStart = String(parsed?.aiValidation?.weekStart || "").trim();
            if (importedWeekStart) url.searchParams.set("date", importedWeekStart);
            window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          }
        }
      } catch {
        // A validação completa acontece ao clicar em Abrir em Montar Treino.
      }

      const successText = importedStudentName
        ? `Resposta da IA importada para ${importedStudentName}. Clique em Abrir em Montar Treino.`
        : "Resposta da IA importada. Clique em Abrir em Montar Treino.";
      setAiImportMessage({ type: "success", text: successText });
      setMessage({ type: "success", text: successText });
    } catch {
      const errorText = "Não foi possível ler o arquivo selecionado.";
      setAiImportMessage({ type: "error", text: errorText });
      setMessage({ type: "error", text: errorText });
    }
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: "success", text: successText });
    } catch {
      setMessage({ type: "error", text: "Não foi possível copiar. Selecione o texto manualmente." });
    }
  }

  function downloadText() {
    if (!summary) return;

    const content = textToShow;
    const filename = `resumo-aluno-${summary.student.name.replaceAll(" ", "-").toLowerCase()}.txt`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  const hasCarePauseBlock = hasOpenCarePause(summary);
  const textToShow = summary
    ? viewMode === "jsonPrompt"
      ? getJsonPrompt(summary)
      : viewMode === "prompt"
        ? hasCarePauseBlock
          ? getCarePauseBlockedText(summary)
          : summary.aiPrompt
        : summary.summaryText
    : "";
  const displayWeekStart = targetWeekStart || resolveWeekStartIso(null);
  const displayWeekEnd = formatIsoDate(addDays(parseDateInput(displayWeekStart) || getNextMonday(), 6));
  const displayExpectedWorkoutDates = targetWorkoutId
    ? targetExpectedWorkoutDates
    : normalizeCurrentWeekExpectedDatesFallback(
        targetExpectedWorkoutDates,
        displayWeekStart
      );
  const displaySchedule = displayExpectedWorkoutDates.length > 0
    ? getTrainingScheduleFromExpectedDates(displayExpectedWorkoutDates)
    : getTrainingSchedule(
        selectedStudent?.contractedTrainingDaysPerMonth || null,
        displayWeekStart
      );
  const backToWorkoutBuilderDate = displaySchedule[0]?.date || displayExpectedWorkoutDates[0] || displayWeekStart;
  const backToWorkoutBuilderHref = selectedStudentId
    ? `/dashboard/montar-treino?studentId=${encodeURIComponent(selectedStudentId)}&date=${encodeURIComponent(backToWorkoutBuilderDate)}${targetWorkoutId ? `&workoutId=${encodeURIComponent(targetWorkoutId)}` : ""}`
    : "/dashboard/montar-treino";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs text-[#00A19C] uppercase tracking-[0.3em] mb-2">
            Apoio inteligente
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-[#f5f5f5]">
            {targetWorkoutId ? "IA para alterar treino existente" : "Resumo do aluno para IA"}
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2 max-w-3xl">
            {targetWorkoutId
              ? "O pacote será gerado somente para o treino selecionado. A resposta da IA substituirá esse treino, sem criar um quarto treino na semana."
              : "Gere um resumo completo do aluno com avaliações, treinos, adesão, dúvidas, avisos e feedbacks. Use o texto para pedir uma sugestão de treino para a IA. A IA apoia, mas o professor revisa e valida antes de cadastrar."}
          </p>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          {!targetWorkoutId && (
            <button
              type="button"
              onClick={() => {
                setBatchMode((current) => !current);
                setBatchMessage(null);
              }}
              className={
                "inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition " +
                (batchMode
                  ? "bg-[#00A19C] border-[#00A19C] text-[#0a0a0a]"
                  : "bg-[#1a1a1a] border-[#00A19C]/30 text-[#00A19C] hover:border-[#00A19C]")
              }
            >
              {batchMode ? "Fechar montagem em lote" : "Montar treinos em lote"}
            </button>
          )}

          <Link
            href={backToWorkoutBuilderHref}
            className="inline-flex items-center justify-center rounded-xl bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] px-4 py-3 text-sm font-semibold hover:border-[#00A19C] transition"
          >
            ← {targetWorkoutId ? "Fechar IA e voltar para edição" : "Fechar IA e voltar para montagem manual"}
          </Link>
        </div>
      </div>

      {batchMode && (
        <div className="bg-[#111] border border-[#00A19C]/30 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[#00A19C]">Montar treinos em lote</h2>
            <p className="text-xs text-[#a1a1a1] mt-1 leading-relaxed">
              Selecione até o tamanho do pacote de alunos que precisam de treino nesta semana, baixe um único pacote
              para todos, envie para a IA e importe a resposta combinada de volta. Cada aluno continua passando pela
              mesma validação de segurança (aluno, semana, quantidade e chave) e pela mesma revisão manual antes de
              salvar — só a geração/importação do pacote é feita de uma vez.
            </p>
          </div>

          {batchMessage && (
            <div
              className={
                "rounded-xl px-4 py-3 text-sm " +
                (batchMessage.type === "success"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : batchMessage.type === "warning"
                    ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                    : "bg-red-500/10 text-red-400 border border-red-500/20")
              }
            >
              {batchMessage.text}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-[#a1a1a1] mb-2">Tamanho do pacote (alunos por vez)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={batchSize}
                onChange={(event) => {
                  const next = Math.min(Math.max(Number(event.target.value) || 1, 1), 20);
                  setBatchSize(next);
                  setBatchSelectedIds((current) => current.slice(0, next));
                }}
                className="w-28 bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              />
            </div>

            <button
              type="button"
              onClick={loadBatchEligibleStudents}
              disabled={batchLoadingEligible || loadingStudents}
              className="px-4 py-3 rounded-xl text-sm bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] hover:border-[#00A19C] transition disabled:opacity-50"
            >
              {batchLoadingEligible ? "Verificando alunos..." : "Listar alunos com treino pendente"}
            </button>
          </div>

          {batchEligibleIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[#a1a1a1]">
                {batchSelectedIds.length}/{batchSize} selecionado(s) de {batchEligibleIds.length} aluno(s) pendente(s).
              </p>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-[#ffffff10] divide-y divide-[#ffffff10]">
                {batchEligibleIds.map((studentId) => {
                  const student = students.find((item) => item.id === studentId);
                  if (!student) return null;

                  const checked = batchSelectedIds.includes(studentId);

                  return (
                    <label
                      key={studentId}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-[#f5f5f5] cursor-pointer hover:bg-[#1a1a1a]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBatchStudent(studentId)}
                        disabled={!checked && batchSelectedIds.length >= batchSize}
                        className="accent-[#00A19C]"
                      />
                      {student.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={generateBatchPackage}
            disabled={batchGenerating || batchSelectedIds.length === 0}
            className="w-full md:w-auto px-5 py-3 rounded-xl text-sm font-semibold bg-[#00A19C] text-[#0a0a0a] hover:bg-[#008B87] transition disabled:opacity-50"
          >
            {batchGenerating ? "Gerando pacote..." : `Baixar pacote ZIP para ${batchSelectedIds.length || ""} aluno(s)`}
          </button>

          <div className="border-t border-[#ffffff10] pt-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#00A19C]">Importar resposta combinada da IA</h3>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Cole aqui o JSON com o formato {"{"}"results":[...]{"}"} devolvido pela IA para este pacote.
              </p>
            </div>

            <textarea
              value={batchJsonText}
              onChange={(event) => setBatchJsonText(event.target.value)}
              placeholder='Cole aqui o JSON, começando com {"results": [...]}'
              className="w-full min-h-[160px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none focus:border-[#00A19C]"
            />

            <button
              type="button"
              onClick={importBatchResponse}
              disabled={batchImporting || !batchJsonText.trim()}
              className="px-4 py-3 rounded-xl text-sm font-semibold bg-[#00A19C] text-[#0a0a0a] hover:bg-[#008B87] transition disabled:opacity-50"
            >
              {batchImporting ? "Validando..." : "Validar resposta do lote"}
            </button>
          </div>

          {batchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#f5f5f5]">Resultado da validação</p>

              {batchResults.map((result) => (
                <div
                  key={result.studentId}
                  className={
                    "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 " +
                    (result.status === "pronto"
                      ? "border-green-500/20 bg-green-500/10"
                      : "border-red-500/20 bg-red-500/10")
                  }
                >
                  <div>
                    <p className="text-sm text-[#f5f5f5] font-semibold">{result.studentName}</p>
                    <p className={"text-xs " + (result.status === "pronto" ? "text-green-400" : "text-red-400")}>
                      {result.status === "pronto" ? "Pronto para revisar" : result.error}
                    </p>
                  </div>

                  {result.status === "pronto" && (
                    <button
                      type="button"
                      onClick={() => openBatchDraftInWorkoutBuilder(result)}
                      className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-[#00A19C] text-[#0a0a0a] hover:bg-[#008B87] transition"
                    >
                      Revisar e salvar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div
          className={
            "rounded-xl px-4 py-3 text-sm " +
            (message.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : message.type === "warning"
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/20")
          }
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-end">
          <div>
            <label className="block text-xs text-[#a1a1a1] mb-2">
              Selecione o aluno
            </label>

            <select
              value={selectedStudentId}
              onChange={(event) => {
                const nextStudentId = event.target.value;
                setSelectedStudentId(nextStudentId);
                setSummary(null);
                setAiJsonText("");
                setAiImportMessage(null);

                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  if (nextStudentId) url.searchParams.set("studentId", nextStudentId);
                  else url.searchParams.delete("studentId");
                  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
                }
              }}
              disabled={loadingStudents}
              className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C] disabled:opacity-60"
            >
              {students.length === 0 ? (
                <option value="">Nenhum aluno encontrado</option>
              ) : (
                students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} · {student.ageYears === null || student.ageYears === undefined ? "Nascimento pendente" : `${student.ageYears} ano(s)`} · Professor: {student.professorName || "Não vinculado"}
                  </option>
                ))
              )}
            </select>

            {selectedStudent && (
              <div className="text-xs text-[#6b6b6b] mt-2 space-y-1">
                <p>
                  {selectedStudent.email || "Sem e-mail"} · {selectedStudent.contractedTrainingDaysPerMonth || "-"} treino(s)/mês
                </p>
                <p className={selectedStudentMissingBirthDate ? "text-red-400" : "text-[#00A19C]"}>
                  {selectedStudentMissingBirthDate
                    ? "Data de nascimento não informada — geração bloqueada"
                    : `Idade: ${selectedStudent.ageYears} ano(s)${selectedStudent.isMinor ? " · menor de idade" : ""}`}
                </p>
                <p className="text-[#00A19C]">
                  Semana alvo da IA: {displayWeekStart} a {displayWeekEnd}
                </p>
                {displaySchedule.length > 0 && (
                  <p>
                    Datas esperadas: {displaySchedule.map((item) => `${item.weekday} (${item.date})`).join(" · ")}
                  </p>
                )}
                {safeWindowNotice && (
                  <p className="text-amber-400">
                    {safeWindowNotice}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={generateSummary}
            disabled={loadingStudents || loadingSummary || loadingExerciseLibrary || !selectedStudentId || exerciseLibrary.length === 0 || selectedStudentMissingBirthDate}
            className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
          >
            {loadingSummary
              ? "Gerando..."
              : loadingExerciseLibrary
                ? "Carregando biblioteca..."
                : exerciseLibrary.length === 0
                  ? "Biblioteca vazia"
                  : selectedStudentMissingBirthDate
                    ? "Data de nascimento pendente"
                    : "Gerar resumo"}
          </button>
        </div>

        <div className="rounded-xl bg-[#00A19C]/10 border border-[#00A19C]/20 p-4">
          <p className="text-sm text-[#00A19C] font-semibold mb-1">
            Fluxo recomendado
          </p>
          <p className="text-xs text-[#a1a1a1] leading-relaxed">
            1. Gere o resumo. 2. Baixe o pacote ZIP para IA. 3. Envie o ZIP para a IA externa.
            4. A IA devolve um TXT com o JSON. 5. Importe o TXT aqui.
            6. O sistema valida aluno, semana, datas e quantidade antes de abrir a montagem para revisão.
          </p>
        </div>
      </div>

      {summary && Math.max(summary.openQuestions?.length || 0, Number(summary.metrics?.openQuestions || 0)) > 0 && !hasOpenCarePause(summary) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
          <div>
            <p className="text-sm font-bold text-amber-300">⚠️ Mensagem do aluno aguardando resposta</p>
            <p className="text-sm text-amber-100/80 mt-1">
              A IA já receberá esse conteúdo como contexto obrigatório para ajustar o próximo treino. Isso não bloqueia a montagem. Revise o rascunho e responda ao aluno antes de liberar a semana.
            </p>
          </div>

          {(summary.openQuestions || []).slice(0, 3).map((question) => (
            <div key={question.id} className="rounded-xl border border-amber-500/20 bg-black/20 px-4 py-3">
              <p className="text-xs text-amber-200/70">
                {new Date(question.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-1 text-sm text-[#f5f5f5] whitespace-pre-wrap">
                {question.conversationText || question.lastMessage || "Mensagem aberta registrada no chat."}
              </p>
            </div>
          ))}

          {(summary.openQuestions?.length || 0) === 0 && (
            <p className="text-xs text-amber-200/70">
              O resumo identificou mensagem(ns) aberta(s). O conteúdo permanece no RESUMO_ALUNO e deve ser revisado antes da liberação.
            </p>
          )}
        </div>
      )}

      {summary && (
        <div className="bg-[#111] border border-[#ffffff10] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">
                {summary.student.name}
              </h2>
              <p className="mt-1 text-xs font-semibold text-[#00A19C]">
                Idade considerada pela IA: {summary.student.ageYears ?? "-"} ano(s)
                {summary.student.isMinor ? " · menor de idade" : ""}
              </p>
              <p className="text-xs text-[#a1a1a1]">
                Professor: {summary.student.professorName || "Não vinculado"} · Meta semanal: {summary.student.weeklyLimit || "-"}
              </p>
              <p className="text-xs text-[#6b6b6b] mt-1">
                Gerado em {new Date(summary.generatedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setViewMode("jsonPrompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "jsonPrompt"
                    ? "bg-[#00A19C] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt JSON
              </button>

              <button
                onClick={() => setViewMode("prompt")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "prompt"
                    ? "bg-[#00A19C] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Prompt texto
              </button>

              <button
                onClick={() => setViewMode("summary")}
                className={
                  "px-3 py-2 rounded-lg text-xs transition " +
                  (viewMode === "summary"
                    ? "bg-[#00A19C] text-[#0a0a0a] font-semibold"
                    : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white")
                }
              >
                Só resumo
              </button>

              <button
                onClick={downloadAiPackage}
                className="px-3 py-2 rounded-lg text-xs bg-[#00A19C] text-[#0a0a0a] font-semibold hover:bg-[#008B87] transition"
              >
                Baixar pacote ZIP para IA
              </button>

              <button
                onClick={() => copyText(textToShow, "Texto copiado.")}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Copiar
              </button>

              <button
                onClick={downloadText}
                className="px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] text-[#a1a1a1] hover:text-white transition"
              >
                Baixar .txt
              </button>
            </div>
          </div>

          {hasCarePauseBlock && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-400 font-semibold mb-1">
                Bloqueio de segurança: pausa por cuidado aberta
              </p>
              <p className="text-xs text-[#f5b7b7] leading-relaxed">
                Este aluno sinalizou que está sem condição de treinar ou possui pausa por cuidado em aberto.
                Não gere nem importe JSON de treino normal enquanto o evento estiver aberto. O professor deve revisar a Central de Cuidado,
                orientar o aluno e aguardar sinalização de aptidão para retomada antes de liberar novo treino.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Treinos</p>
              <p className="text-xl text-[#00A19C] font-bold">{summary.metrics.workouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Concluídos</p>
              <p className="text-xl text-green-400 font-bold">{summary.metrics.completedWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Vencidos</p>
              <p className="text-xl text-red-400 font-bold">{summary.metrics.overdueWorkouts || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Avaliações</p>
              <p className="text-xl text-[#f5f5f5] font-bold">{summary.metrics.avaliacoes || 0}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3">
              <p className="text-[10px] text-[#6b6b6b] uppercase">Feedbacks</p>
              <p className="text-xl text-blue-400 font-bold">{summary.metrics.feedbacks || 0}</p>
            </div>
          </div>

          <textarea
            value={textToShow}
            readOnly
            className="w-full min-h-[560px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none"
          />

          <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#00A19C]">
                Importar JSON do arquivo .txt gerado pela IA
              </h3>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Depois de enviar o pacote ZIP para a IA, importe aqui o arquivo TXT retornado ou cole o JSON.
                O sistema vai validar aluno, semana, datas, quantidade de treinos e chave de segurança antes de abrir a montagem para revisão.
              </p>
            </div>

            {hasCarePauseBlock && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-[#f5b7b7] leading-relaxed">
                Importação bloqueada para este aluno enquanto houver pausa por cuidado aberta.
                Resolva/revise o evento de cuidado antes de montar ou liberar nova semana.
              </div>
            )}

            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[#00A19C]/30 bg-[#00A19C]/10 px-4 py-3 text-sm font-semibold text-[#00A19C] hover:bg-[#00A19C]/20 transition">
              Importar resposta TXT/JSON
              <input
                type="file"
                accept=".txt,.json,text/plain,application/json"
                className="hidden"
                onChange={(event) => {
                  void importAiResponseFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                disabled={hasCarePauseBlock}
              />
            </label>

            <textarea
              value={aiJsonText}
              onChange={(event) => {
                setAiJsonText(event.target.value);
                setAiImportMessage(null);
              }}
              disabled={hasCarePauseBlock}
              placeholder={
                hasCarePauseBlock
                  ? "Importação bloqueada: aluno em pausa por cuidado."
                  : 'Cole aqui o JSON gerado pela IA, começando com {"studentId": "...", "workouts": [...]}'
              }
              className="w-full min-h-[220px] bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-xs md:text-sm text-[#e5e5e5] font-mono leading-relaxed outline-none focus:border-[#00A19C] disabled:opacity-50"
            />

            {aiImportMessage && (
              <div
                className={
                  "rounded-xl px-4 py-3 text-sm " +
                  (aiImportMessage.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20")
                }
              >
                {aiImportMessage.text}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-[#6b6b6b]">
                Segurança: o JSON não grava nada sozinho. Se for de outro aluno, outra semana, outra data ou aluno em pausa por cuidado, será bloqueado.
              </p>

              <button
                type="button"
                onClick={openJsonInWorkoutBuilder}
                disabled={hasCarePauseBlock || !aiJsonText.trim()}
                className="bg-[#00A19C] text-[#0a0a0a] rounded-xl px-5 py-3 font-semibold text-sm hover:bg-[#008B87] transition disabled:opacity-50"
              >
                Abrir em Montar Treino
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
