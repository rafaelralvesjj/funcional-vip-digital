"use client";
import { useEffect, useState } from "react";
import WorkoutMuscleMap from "@/components/WorkoutMuscleMap";
import { getSaoPauloCivilDateInput, isUnsafeCurrentWeekPlanningDate as isUnsafePlanningWindow } from "@/lib/planning-window";
import {
  formatPreferredWorkoutDays,
  getPreferredWorkoutOffsets,
  normalizePreferredWorkoutDays,
  pickDistributedWorkoutOffsets,
  resolveRecurringWorkoutOffsets,
} from "@/lib/student-workout-days";

interface Student {
  id: string;
  name: string;
  email?: string;
  image?: string;
  birthDate?: string | null;
  ageYears?: number | null;
  isMinor?: boolean;
  hasBirthDate?: boolean;
  contractedTrainingDaysPerMonth?: number | null;
  preferredWorkoutDays?: string[];
  preferredWorkoutDaysLabel?: string | null;
}

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  sequencePrompt?: string | null;
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
}

interface WorkoutPlanSummary {
  id: string;
  date?: string | null;
  createdAt?: string | null;
}

interface ActiveWorkoutContract {
  id: string;
  type: string;
  status: string;
  commercialStatus?: string | null;
  startDate: string;
  endDate: string;
  workoutsPerWeek: number;
  workoutsPerMonth: number;
  totalContractedWorkouts: number;
  planId?: string | null;
  planName?: string | null;
}

interface WorkoutWeekSummary {
  plans?: WorkoutPlanSummary[];
  activeContract?: ActiveWorkoutContract | null;
  weeklyLimit?: number | null;
  weeklyPlansCount?: number;
  weeklyRemaining?: number | null;
  expectedWorkoutDates?: string[];
  preferredWorkoutDays?: string[];
  preferredWorkoutDaysLabel?: string | null;
  canCreateWorkout?: boolean;
  message?: string | null;
  effectivePlanningStart?: string | null;
  careReturn?: {
    active?: boolean;
    planningStart?: string | null;
    resolvedAt?: string | null;
  } | null;
}

interface ReleaseReviewContext {
  baselineDate?: string;
  latestNewContextDate?: string | null;
  previousWeek?: {
    startOfWeek?: string;
    endOfWeek?: string;
    label?: string;
  };
  previousWeekWorkouts?: number;
  completedPreviousWeek?: number;
  pendingPreviousWeek?: number;
  workoutUpdatesAfterPlanning?: number;
  openCareEvents?: number;
  newCareEventsAfterPlanning?: number;
  criticalCareEventsAfterPlanning?: number;
  newStudentQuestions?: number;
  newStudentQuestionsAfterPlanning?: number;
  newPainQuestionsAfterPlanning?: number;
  hasOpenPainQuestion?: boolean;
  hasTrainingPauseCareEvent?: boolean;
  hasCriticalOpenCareEvent?: boolean;
  studentProfileUpdatedAfterPlanning?: boolean;
  stalePrescriptionBecauseOfNewContext?: boolean;
  recommendedAction?: string;
  actionOptions?: string[];
  requiresReviewBeforeRelease?: boolean;
  reviewAlerts?: string[];
}

interface ExerciseItem {
  libraryExerciseId: string;
  name: string;
  description: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  purpose?: string | null;
  instructions?: string | null;
  safetyGuidance?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
  muscleGroup?: string | null;
}

interface AiWorkoutDraft {
  name?: string;
  date?: string;
  description?: string;
  objective?: string;
  focusAreas?: string;
  intensity?: string;
  estimatedDurationMinutes?: number | null;
  estimatedCaloriesMin?: number | null;
  estimatedCaloriesMax?: number | null;
  studentSummary?: string;
  safetyNote?: string;
  notes?: string;
  exercises?: Partial<ExerciseItem>[];
}

interface AiWorkoutDraftBatch {
  source?: string;
  createdAt?: string;
  studentId: string;
  studentName?: string;
  editingWorkoutId?: string | null;
  currentIndex?: number;
  scheduleDescription?: string;
  scheduleWarning?: string;
  workouts: AiWorkoutDraft[];
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

/**
 * Se o professor veio de um lote de montagem em vários alunos (tela de
 * resumo-aluno em modo lote) e ainda restam alunos na fila, volta direto
 * para o painel de lote em vez de mandar para o Dashboard — assim ele não
 * precisa clicar em "Montar treinos em lote" de novo a cada aluno salvo.
 */
function getNextBatchDestination(): string | null {
  try {
    const raw = window.localStorage.getItem("aiWorkoutBatchQueue");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const week = parsed?.week === "next" ? "next" : parsed?.week === "current" ? "current" : null;

    if (!week || !Array.isArray(parsed?.results) || parsed.results.length === 0) {
      return null;
    }

    return `/dashboard/resumo-aluno?batch=1&week=${week}`;
  } catch {
    return null;
  }
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getCivilDateInput(value?: string | Date | null): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate?.[1]) return isoDate[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Datas de treino/contrato são datas civis. Usar UTC evita 03/08 virar 02/08
  // no navegador em Brasília quando a API devolve meia-noite UTC.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateInputFromRaw(value?: string | Date | null): string | null {
  return getCivilDateInput(value);
}

function getWeekdayInSaoPaulo(referenceDate = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(referenceDate);
}

function isUnsafeCurrentWeekPlanningDate(dateInput?: string | null): boolean {
  return isUnsafePlanningWindow(dateInput);
}

function getNextSafePlanningDateInput(dateInput?: string | null): {
  dateInput: string | null;
  redirected: boolean;
  message?: string;
} {
  if (!isUnsafeCurrentWeekPlanningDate(dateInput)) {
    return { dateInput: dateInput || null, redirected: false };
  }

  const nextWeekStart = getWeekRange(new Date()).endOfWeek;

  return {
    dateInput: formatDateInput(nextWeekStart),
    redirected: true,
    message: "Esta semana já não possui janela segura de execução. O planejamento foi direcionado para a próxima semana.",
  };
}


function getExpectedWorkoutDatesForWeek(
  startOfWeek: Date,
  weeklyLimit?: number | null,
  activeContract?: ActiveWorkoutContract | null,
  existingPlans: WorkoutPlanSummary[] = [],
  careReturnPlanningStartInput?: string | null,
  preferredWorkoutDays?: unknown
): string[] {
  const limit = Math.max(Number(weeklyLimit || 0), 0);

  if (!limit) return [];

  const weekStartInput = formatDateInput(startOfWeek);

  const weekEndExclusive = new Date(startOfWeek);
  weekEndExclusive.setDate(startOfWeek.getDate() + 7);
  weekEndExclusive.setHours(12, 0, 0, 0);
  const weekEndExclusiveInput = formatDateInput(weekEndExclusive);

  const contractStartInput = getDateInputFromRaw(activeContract?.startDate);
  const contractEndInput = getDateInputFromRaw(activeContract?.endDate);

  const createdDates = Array.from(
    new Set(
      existingPlans
        .map((plan) => getPlanDateInput(plan))
        .filter((value): value is string => Boolean(value))
        .filter((value) => value >= weekStartInput && value < weekEndExclusiveInput)
    )
  ).sort();

  const hasCarryOverWorkoutFromPreviousContract = Boolean(
    contractStartInput &&
      contractStartInput > weekStartInput &&
      createdDates.some((planDate) => planDate < contractStartInput)
  );

  let effectiveStartInput = hasCarryOverWorkoutFromPreviousContract
    ? weekStartInput
    : contractStartInput && contractStartInput > weekStartInput
      ? contractStartInput
      : weekStartInput;

  const effectiveEndExclusiveInput =
    contractEndInput && contractEndInput < weekEndExclusiveInput
      ? contractEndInput
      : weekEndExclusiveInput;

  const careReturnStartInput =
    careReturnPlanningStartInput &&
    careReturnPlanningStartInput >= weekStartInput &&
    careReturnPlanningStartInput < weekEndExclusiveInput
      ? careReturnPlanningStartInput
      : null;

  if (careReturnStartInput && careReturnStartInput > effectiveStartInput) {
    effectiveStartInput = careReturnStartInput;
  }

  // Em semana atual, datas passadas ainda não criadas nunca voltam como
  // "treino restante". Treinos já salvos continuam contando normalmente.
  const todayInput = getSaoPauloCivilDateInput();
  const todayDate = parseDateInput(todayInput) || new Date();
  const currentWeek = getWeekRange(todayDate);
  const isCurrentWeek =
    formatDateInput(currentWeek.startOfWeek) === weekStartInput;

  let earliestSelectableInput = effectiveStartInput;

  if (isCurrentWeek && todayInput > earliestSelectableInput) {
    earliestSelectableInput = todayInput;
  }

  const remainingCount = Math.max(limit - createdDates.length, 0);

  if (remainingCount <= 0) {
    return createdDates.slice(0, limit);
  }

  const sunday = new Date(startOfWeek);
  sunday.setDate(startOfWeek.getDate() + 6);
  sunday.setHours(12, 0, 0, 0);
  const sundayInput = formatDateInput(sunday);

  if (
    earliestSelectableInput >= effectiveEndExclusiveInput ||
    earliestSelectableInput > sundayInput
  ) {
    return createdDates.slice(0, limit);
  }

  const structuredPreferredDays = normalizePreferredWorkoutDays(preferredWorkoutDays);

  if (structuredPreferredDays.length > 0) {
    const preferredOffsets = getPreferredWorkoutOffsets(structuredPreferredDays);

    if (structuredPreferredDays.length > limit) {
      const preferredDateByOffset = new Map(
        preferredOffsets.map((offset) => {
          const candidateDate = new Date(startOfWeek);
          candidateDate.setDate(startOfWeek.getDate() + offset);
          candidateDate.setHours(12, 0, 0, 0);
          return [offset, formatDateInput(candidateDate)] as const;
        })
      );
      const preferredDateSet = new Set(preferredDateByOffset.values());
      const unpreferredCreatedCount = createdDates.filter(
        (createdDate) => !preferredDateSet.has(createdDate)
      ).length;
      const targetPreferredCount = Math.max(limit - unpreferredCreatedCount, 0);
      const eligiblePreferredOffsets = preferredOffsets.filter((offset) => {
        const candidate = preferredDateByOffset.get(offset) || "";

        return (
          createdDates.includes(candidate) ||
          (candidate >= earliestSelectableInput &&
            candidate < effectiveEndExclusiveInput &&
            candidate <= sundayInput)
        );
      });
      const plannedOffsets = pickDistributedWorkoutOffsets(
        eligiblePreferredOffsets,
        targetPreferredCount
      );
      const selectedDates = plannedOffsets
        .map((offset) => preferredDateByOffset.get(offset) || "")
        .filter((candidate) => Boolean(candidate) && !createdDates.includes(candidate))
        .slice(0, remainingCount);

      return Array.from(new Set([...createdDates, ...selectedDates]))
        .sort()
        .slice(0, limit);
    }

    const availablePreferredOffsets = preferredOffsets.filter((offset) => {
      const candidateDate = new Date(startOfWeek);
      candidateDate.setDate(startOfWeek.getDate() + offset);
      candidateDate.setHours(12, 0, 0, 0);
      const candidate = formatDateInput(candidateDate);

      return (
        candidate >= earliestSelectableInput &&
        candidate < effectiveEndExclusiveInput &&
        candidate <= sundayInput &&
        !createdDates.includes(candidate)
      );
    });

    const selectedDates = availablePreferredOffsets
      .slice(0, remainingCount)
      .map((offset) => {
        const candidateDate = new Date(startOfWeek);
        candidateDate.setDate(startOfWeek.getDate() + offset);
        candidateDate.setHours(12, 0, 0, 0);
        return formatDateInput(candidateDate);
      });

    return Array.from(new Set([...createdDates, ...selectedDates]))
      .sort()
      .slice(0, limit);
  }

  const selectableDates: string[] = [];

  for (const offset of resolveRecurringWorkoutOffsets(limit, [])) {
    const candidateDate = new Date(startOfWeek);
    candidateDate.setDate(startOfWeek.getDate() + offset);
    candidateDate.setHours(12, 0, 0, 0);

    const candidate = formatDateInput(candidateDate);

    if (
      candidate < earliestSelectableInput ||
      candidate >= effectiveEndExclusiveInput ||
      candidate > sundayInput ||
      createdDates.includes(candidate)
    ) {
      continue;
    }

    if (!selectableDates.includes(candidate)) {
      selectableDates.push(candidate);
    }

    if (selectableDates.length >= remainingCount) break;
  }

  const fallbackDates: string[] = [];
  const cursor = parseDateInput(earliestSelectableInput);
  const end = parseDateInput(effectiveEndExclusiveInput);

  if (cursor && end) {
    while (cursor.getTime() < end.getTime()) {
      const candidate = formatDateInput(cursor);
      if (
        candidate <= sundayInput &&
        !createdDates.includes(candidate) &&
        !selectableDates.includes(candidate)
      ) {
        fallbackDates.push(candidate);
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  let stillNeeded = remainingCount - selectableDates.length;

  if (stillNeeded === 1 && fallbackDates.length > 0) {
    selectableDates.push(
      createdDates.length > 0 || selectableDates.length > 0
        ? fallbackDates[fallbackDates.length - 1]
        : fallbackDates[0]
    );
    stillNeeded = 0;
  }

  if (stillNeeded > 0 && fallbackDates.length > 0) {
    const available = fallbackDates.filter(
      (value) => !selectableDates.includes(value)
    );

    if (stillNeeded >= available.length) {
      selectableDates.push(...available);
    } else {
      for (let index = 0; index < stillNeeded; index += 1) {
        const position =
          stillNeeded === 1
            ? 0
            : Math.round(
                (index * (available.length - 1)) / (stillNeeded - 1)
              );
        const candidate = available[position];

        if (candidate && !selectableDates.includes(candidate)) {
          selectableDates.push(candidate);
        }
      }

      for (const candidate of available) {
        if (selectableDates.length >= remainingCount) break;
        if (!selectableDates.includes(candidate)) {
          selectableDates.push(candidate);
        }
      }
    }
  }

  return Array.from(new Set([...createdDates, ...selectableDates]))
    .sort()
    .slice(0, limit);
}

function getPlanDateInput(plan: WorkoutPlanSummary): string | null {
  return getCivilDateInput(plan.date || plan.createdAt || null);
}

function getFirstMissingExpectedDate(
  expectedDates: string[],
  plans: WorkoutPlanSummary[]
): string | null {
  const createdDates = new Set(
    plans
      .map(getPlanDateInput)
      .filter((value): value is string => Boolean(value))
  );

  return expectedDates.find((date) => !createdDates.has(date)) || null;
}

function getWeekScopeLabel(startOfWeek: Date): string {
  const currentWeek = getWeekRange(new Date());

  if (startOfWeek.getTime() === currentWeek.startOfWeek.getTime()) {
    return "semana atual";
  }

  if (startOfWeek.getTime() === currentWeek.endOfWeek.getTime()) {
    return "próxima semana";
  }

  if (startOfWeek.getTime() > currentWeek.endOfWeek.getTime()) {
    return "semana futura";
  }

  return "semana anterior";
}

function escapeHtmlForPrint(value?: string | number | null): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('\"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactText(value?: string | number | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function joinTextParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => compactText(part))
    .filter(Boolean)
    .join(" ");
}

function buildExercisePurpose(exercise?: Partial<LibraryExercise> | null): string {
  if (!exercise) return "";

  const objectiveText = compactText(exercise.objectiveTags)
    ? `Objetivo relacionado: ${compactText(exercise.objectiveTags)}.`
    : "";

  return joinTextParts([exercise.description, objectiveText]);
}

function buildExerciseInstructions(exercise?: Partial<LibraryExercise> | null): string {
  if (!exercise) return "";

  return compactText(exercise.instructions) || compactText(exercise.description);
}

function buildExerciseSafetyGuidance(exercise?: Partial<LibraryExercise> | null): string {
  if (!exercise) return "";

  return joinTextParts([
    exercise.safetyNotes,
    exercise.restrictionTags ? `Atenção: ${exercise.restrictionTags}.` : null,
    exercise.commonMistakes ? `Evite: ${exercise.commonMistakes}.` : null,
    exercise.contraindications ? `Contraindicação/atenção: ${exercise.contraindications}.` : null,
  ]);
}

function getExercisePurpose(exercise: Partial<ExerciseItem>): string {
  return compactText(exercise.purpose) || compactText(exercise.description);
}

function getExerciseInstructions(exercise: Partial<ExerciseItem>): string {
  return compactText(exercise.instructions) || compactText(exercise.description);
}

function getExerciseSafetyGuidance(exercise: Partial<ExerciseItem>): string {
  return joinTextParts([
    exercise.safetyGuidance,
    exercise.commonMistakes ? `Evite: ${exercise.commonMistakes}.` : null,
    exercise.contraindications ? `Contraindicação/atenção: ${exercise.contraindications}.` : null,
  ]);
}

export default function MontarTreinoPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [filteredLibrary, setFilteredLibrary] = useState<LibraryExercise[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [planName, setPlanName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [intensity, setIntensity] = useState("");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("");
  const [estimatedCaloriesMin, setEstimatedCaloriesMin] = useState("");
  const [estimatedCaloriesMax, setEstimatedCaloriesMax] = useState("");
  const [studentSummary, setStudentSummary] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [weeklyPlansCount, setWeeklyPlansCount] = useState(0);
  const [weeklyPlans, setWeeklyPlans] = useState<WorkoutPlanSummary[]>([]);
  const [weeklyInfoLoading, setWeeklyInfoLoading] = useState(false);
  const [activeWorkoutContract, setActiveWorkoutContract] = useState<ActiveWorkoutContract | null>(null);
  const [careReturnPlanningStart, setCareReturnPlanningStart] = useState<string | null>(null);
  // Fonte única da programação: quando a API responde, as datas do banco
  // prevalecem sobre qualquer cálculo antigo da tela/URL. null = ainda não consultou.
  const [serverExpectedWorkoutDates, setServerExpectedWorkoutDates] = useState<string[] | null>(null);
  const [contractWarning, setContractWarning] = useState<string | null>(null);
  const [lockStudentSelection, setLockStudentSelection] = useState(false);
  const [openedFromPendingList, setOpenedFromPendingList] = useState(false);
  const [pendingWeekLabelFromUrl, setPendingWeekLabelFromUrl] = useState<string | null>(null);
  const [safeWindowNotice, setSafeWindowNotice] = useState<string | null>(null);
  const [aiDraftBatch, setAiDraftBatch] = useState<AiWorkoutDraftBatch | null>(null);
  const [aiDraftIndex, setAiDraftIndex] = useState(0);
  const [openedFromAiDraft, setOpenedFromAiDraft] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseReviewContext, setReleaseReviewContext] = useState<ReleaseReviewContext | null>(null);
  const [releaseMessage, setReleaseMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingWorkoutLoaded, setEditingWorkoutLoaded] = useState(false);
  const [loadAiDraftWhenReady, setLoadAiDraftWhenReady] = useState(false);

  function normalizeAiExercise(exercise: Partial<ExerciseItem> & { exerciseId?: string; exerciseLibraryId?: string }, index: number): ExerciseItem {
    const libraryExerciseId = String(
      exercise?.libraryExerciseId ||
        exercise?.exerciseId ||
        exercise?.exerciseLibraryId ||
        ""
    );

    const libraryExercise = library.find((item) => item.id === libraryExerciseId);

    return {
      libraryExerciseId,
      name: String(libraryExercise?.name || exercise?.name || `Exercício ${index + 1}`),
      description: String(exercise?.description || libraryExercise?.description || ""),
      series: Number(exercise?.series || 3),
      reps: String(exercise?.reps || "10"),
      weight: String(exercise?.weight || ""),
      restTime: String(exercise?.restTime || "60s"),
      notes: String(exercise?.notes || ""),
      order: index,
      imageUrl: exercise?.imageUrl || libraryExercise?.imageUrl || null,
      videoUrl: exercise?.videoUrl || libraryExercise?.videoUrl || null,
      sequenceImageUrl: (exercise as any)?.sequenceImageUrl || libraryExercise?.sequenceImageUrl || null,
      sequenceImageLabel: (exercise as any)?.sequenceImageLabel || libraryExercise?.sequenceImageLabel || null,
      sequenceImageNotes: (exercise as any)?.sequenceImageNotes || libraryExercise?.sequenceImageNotes || null,
      sequenceFramesCount: Number((exercise as any)?.sequenceFramesCount || libraryExercise?.sequenceFramesCount || 0) || null,
      sequenceGeneratedByAi: Boolean((exercise as any)?.sequenceGeneratedByAi || libraryExercise?.sequenceGeneratedByAi),
      purpose: String((exercise as any)?.purpose || buildExercisePurpose(libraryExercise) || exercise?.description || libraryExercise?.description || ""),
      instructions: String((exercise as any)?.instructions || buildExerciseInstructions(libraryExercise) || ""),
      safetyGuidance: String((exercise as any)?.safetyGuidance || buildExerciseSafetyGuidance(libraryExercise) || ""),
      commonMistakes: String((exercise as any)?.commonMistakes || libraryExercise?.commonMistakes || "") || null,
      contraindications: String((exercise as any)?.contraindications || libraryExercise?.contraindications || "") || null,
      muscleGroup: String((exercise as any)?.muscleGroup || libraryExercise?.muscleGroup || "") || null,
    };
  }

  function applyAiWorkoutDraft(batch: AiWorkoutDraftBatch, index = 0) {
    const workout = batch.workouts?.[index];

    if (!workout) return;

    setAiDraftBatch(batch);
    setAiDraftIndex(index);
    setOpenedFromAiDraft(true);
    setOpenedFromPendingList(false);

    if (batch.studentId) {
      setSelectedStudent(batch.studentId);
      setLockStudentSelection(true);
    }

    setPlanName(String(workout.name || ""));
    setDate(String(workout.date || ""));
    setDescription(String(workout.description || ""));
    setObjective(String(workout.objective || ""));
    setFocusAreas(String(workout.focusAreas || ""));
    setIntensity(String(workout.intensity || ""));
    setEstimatedDurationMinutes(
      workout.estimatedDurationMinutes === null || workout.estimatedDurationMinutes === undefined
        ? ""
        : String(workout.estimatedDurationMinutes)
    );
    setEstimatedCaloriesMin(
      workout.estimatedCaloriesMin === null || workout.estimatedCaloriesMin === undefined
        ? ""
        : String(workout.estimatedCaloriesMin)
    );
    setEstimatedCaloriesMax(
      workout.estimatedCaloriesMax === null || workout.estimatedCaloriesMax === undefined
        ? ""
        : String(workout.estimatedCaloriesMax)
    );
    setStudentSummary(String(workout.studentSummary || ""));
    setSafetyNote(String(workout.safetyNote || ""));
    setNotes(String(workout.notes || ""));
    setExercises(
      Array.isArray(workout.exercises)
        ? workout.exercises.map((exercise, exerciseIndex) =>
            normalizeAiExercise(exercise, exerciseIndex)
          )
        : []
    );
  }

  function loadAiWorkoutDraftFromStorage() {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem("aiWorkoutDraftBatch");

      if (!raw) return;

      const parsed = JSON.parse(raw) as AiWorkoutDraftBatch;

      if (!parsed?.studentId || !Array.isArray(parsed.workouts) || parsed.workouts.length === 0) {
        return;
      }

      const index = Math.min(
        Math.max(Number(parsed.currentIndex || 0), 0),
        parsed.workouts.length - 1
      );

      applyAiWorkoutDraft(parsed, index);
    } catch (error) {
      console.error("Erro ao carregar rascunho da IA:", error);
    }
  }

  function clearAiWorkoutDraft() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("aiWorkoutDraftBatch");
    }

    setAiDraftBatch(null);
    setAiDraftIndex(0);
    setOpenedFromAiDraft(false);
    setLockStudentSelection(false);
    setPlanName("");
    setDate("");
    setDescription("");
    setObjective("");
    setFocusAreas("");
    setIntensity("");
    setEstimatedDurationMinutes("");
    setEstimatedCaloriesMin("");
    setEstimatedCaloriesMax("");
    setStudentSummary("");
    setSafetyNote("");
    setNotes("");
    setExercises([]);
  }

  function loadAiDraftByIndex(nextIndex: number) {
    if (!aiDraftBatch) return;

    const safeIndex = Math.min(Math.max(nextIndex, 0), aiDraftBatch.workouts.length - 1);
    const updatedBatch = {
      ...aiDraftBatch,
      currentIndex: safeIndex,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem("aiWorkoutDraftBatch", JSON.stringify(updatedBatch));
    }

    applyAiWorkoutDraft(updatedBatch, safeIndex);
  }

  function applyDashboardParams() {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const studentIdFromUrl = params.get("studentId");
    const dateFromUrl = params.get("date");
    const weekFromUrl = params.get("week");
    const workoutIdFromUrl = params.get("workoutId");

    if (workoutIdFromUrl) {
      setEditingWorkoutId(workoutIdFromUrl);
      setEditingWorkoutLoaded(false);
    }

    if (studentIdFromUrl) {
      setSelectedStudent(studentIdFromUrl);
      setLockStudentSelection(true);
      setOpenedFromPendingList(!workoutIdFromUrl);
    }

    // Em modo de edição, a data correta vem do treino existente. Não deixe
    // a lógica de pendência semanal empurrar o professor para outra data.
    if (workoutIdFromUrl) {
      if (dateFromUrl) setDate(dateFromUrl);
      setPendingWeekLabelFromUrl("treino existente");
      setSafeWindowNotice(null);
      return;
    }

    if (weekFromUrl === "current") {
      setPendingWeekLabelFromUrl("semana atual");
    } else if (weekFromUrl === "next") {
      setPendingWeekLabelFromUrl("próxima semana");
    } else if (studentIdFromUrl) {
      setPendingWeekLabelFromUrl("semana selecionada no dashboard");
    }

    const currentWeek = getWeekRange(new Date());

    if (weekFromUrl === "current") {
      // A semana operacional permanece aberta de segunda a domingo. A data
      // exata será ajustada abaixo para o próximo dia programado do aluno.
      setDate(formatDateInput(currentWeek.startOfWeek));
      setSafeWindowNotice(null);
      setPendingWeekLabelFromUrl("semana atual");
      return;
    }

    const dashboardDate =
      weekFromUrl === "next"
        ? formatDateInput(currentWeek.endOfWeek)
        : dateFromUrl;

    if (dashboardDate) {
      const safeDate = getNextSafePlanningDateInput(dashboardDate);
      setDate(safeDate.dateInput || dashboardDate);

      if (safeDate.redirected && safeDate.message) {
        setSafeWindowNotice(safeDate.message);
        setPendingWeekLabelFromUrl("próxima semana por janela segura");
      } else {
        setSafeWindowNotice(null);
      }
    }
  }
  useEffect(() => {
    applyDashboardParams();

    /*
     * O rascunho salvo pela IA só deve ser carregado quando esta tela
     * tiver sido aberta explicitamente pelo resumo do aluno.
     *
     * Antes, qualquer entrada em "Montar treino" tentava ler e aplicar
     * aiWorkoutDraftBatch do localStorage. Um rascunho antigo ou muito
     * grande podia sobrecarregar a renderização e derrubar a aba do Chrome,
     * mesmo quando o professor vinha apenas pelo dashboard.
     */
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const openedFromAiJson = params?.get("source") === "ai-json";
    setLoadAiDraftWhenReady(Boolean(openedFromAiJson));

    fetchStudents();
    fetchLibrary();
  }, []);

  async function loadWorkoutForEditing(workoutId: string) {
    try {
      const res = await fetch(`/api/workout-plan?id=${encodeURIComponent(workoutId)}`, {
        cache: "no-store",
      });
      const plan = await res.json().catch(() => null);

      if (!res.ok || !plan?.id) {
        alert(plan?.error || "Não foi possível carregar o treino para edição.");
        setEditingWorkoutLoaded(true);
        return;
      }

      setSelectedStudent(String(plan.studentId || ""));
      setLockStudentSelection(true);
      setPlanName(String(plan.name || ""));
      setDate(getCivilDateInput(plan.date) || "");
      setDescription(String(plan.description || ""));
      setObjective(String(plan.objective || ""));
      setFocusAreas(String(plan.focusAreas || ""));
      setIntensity(String(plan.intensity || ""));
      setEstimatedDurationMinutes(plan.estimatedDurationMinutes == null ? "" : String(plan.estimatedDurationMinutes));
      setEstimatedCaloriesMin(plan.estimatedCaloriesMin == null ? "" : String(plan.estimatedCaloriesMin));
      setEstimatedCaloriesMax(plan.estimatedCaloriesMax == null ? "" : String(plan.estimatedCaloriesMax));
      setStudentSummary(String(plan.studentSummary || ""));
      setSafetyNote(String(plan.safetyNote || ""));
      setNotes(String(plan.notes || ""));
      setExercises(
        Array.isArray(plan.exercises)
          ? plan.exercises.map((exercise: any, index: number) =>
              normalizeAiExercise(
                {
                  libraryExerciseId: exercise.libraryExerciseId,
                  name: exercise.name,
                  description: exercise.description,
                  series: exercise.series,
                  reps: exercise.reps,
                  weight: exercise.weight,
                  restTime: exercise.restTime,
                  notes: exercise.notes,
                  order: exercise.order,
                  imageUrl: exercise.imageUrl,
                  videoUrl: exercise.videoUrl,
                  muscleGroup: exercise.libraryExercise?.muscleGroup || null,
                },
                index
              )
            )
          : []
      );
    } catch (error) {
      console.error("Erro ao carregar treino para edição:", error);
      alert("Não foi possível carregar o treino para edição.");
    } finally {
      setEditingWorkoutLoaded(true);
    }
  }

  useEffect(() => {
    if (!editingWorkoutId) {
      setEditingWorkoutLoaded(true);
      return;
    }

    void loadWorkoutForEditing(editingWorkoutId);
  }, [editingWorkoutId]);

  useEffect(() => {
    if (!loadAiDraftWhenReady) return;
    if (library.length === 0) return;
    if (editingWorkoutId && !editingWorkoutLoaded) return;

    loadAiWorkoutDraftFromStorage();
    setLoadAiDraftWhenReady(false);
  }, [loadAiDraftWhenReady, library.length, editingWorkoutId, editingWorkoutLoaded]);

  useEffect(() => {
    /*
     * Reaplica os parâmetros depois que a lista de alunos carrega.
     * Isso garante que o combo fique selecionado mesmo quando a tela veio
     * do dashboard antes de os alunos terminarem de carregar.
     */
    if (students.length > 0 && !openedFromAiDraft && !editingWorkoutId) {
      applyDashboardParams();
    }
  }, [students.length, openedFromAiDraft, editingWorkoutId]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      setFilteredLibrary(
        library.filter(
          (ex) =>
            ex.name.toLowerCase().includes(term) ||
            ex.muscleGroup.toLowerCase().includes(term) ||
            String(ex.objectiveTags || "").toLowerCase().includes(term) ||
            String(ex.equipmentTags || "").toLowerCase().includes(term) ||
            String(ex.restrictionTags || "").toLowerCase().includes(term) ||
            String(ex.description || "").toLowerCase().includes(term) ||
            String(ex.sequenceImageLabel || "").toLowerCase().includes(term) ||
            String(ex.sequenceImageNotes || "").toLowerCase().includes(term)
        )
      );
    } else {
      setFilteredLibrary(library);
    }
  }, [searchTerm, library]);

  const selectedStudentInfo = students.find((student) => student.id === selectedStudent);
  const selectedStudentMissingBirthDate =
    Boolean(selectedStudentInfo) &&
    (selectedStudentInfo?.ageYears === null || selectedStudentInfo?.ageYears === undefined);
  const weeklyWorkoutLimit = activeWorkoutContract?.workoutsPerWeek || null;
  const referenceWeekDate = date ? new Date(date + "T12:00:00") : new Date();
  const { startOfWeek, endOfWeek } = getWeekRange(referenceWeekDate);
  const weekScopeLabel = getWeekScopeLabel(startOfWeek);
  const clientExpectedWorkoutDates = getExpectedWorkoutDatesForWeek(
    startOfWeek,
    weeklyWorkoutLimit,
    activeWorkoutContract,
    weeklyPlans,
    careReturnPlanningStart,
    selectedStudentInfo?.preferredWorkoutDays
  );
  const createdWorkoutDatesThisWeek = Array.from(
    new Set(
      weeklyPlans
        .map((plan) => getPlanDateInput(plan))
        .filter((value): value is string => Boolean(value))
        .filter((value) =>
          value >= formatDateInput(startOfWeek) &&
          value < formatDateInput(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7, 12, 0, 0, 0))
        )
    )
  ).sort();

  /*
   * A API é a fonte autoritativa da programação semanal.
   *
   * Antes, quando existia uma retomada por cuidado, o cliente reconstruía a
   * agenda novamente e podia trocar uma data válida devolvida pela API por
   * outra data da semana (ex.: servidor = 19/08, tela = 23/08). Depois do
   * primeiro treino salvo isso deixava a interface e o backend em desacordo e
   * o segundo treino era rejeitado.
   *
   * Agora, quando a API já respondeu, usamos exatamente as datas restantes
   * que ela calculou e apenas somamos os treinos que já foram criados para
   * exibir a programação completa na tela. O cálculo local fica somente como
   * fallback enquanto a resposta do servidor ainda não chegou.
   */
  const authoritativeExpectedWorkoutDates = serverExpectedWorkoutDates !== null
    ? Array.from(
        new Set([
          ...createdWorkoutDatesThisWeek,
          ...serverExpectedWorkoutDates,
        ])
      ).sort()
    : null;
  const expectedWorkoutDates = authoritativeExpectedWorkoutDates !== null
    ? weeklyWorkoutLimit
      ? authoritativeExpectedWorkoutDates.slice(0, weeklyWorkoutLimit)
      : authoritativeExpectedWorkoutDates
    : clientExpectedWorkoutDates;
  const firstMissingExpectedDate = getFirstMissingExpectedDate(
    expectedWorkoutDates,
    weeklyPlans
  );
  const remainingExpectedWorkoutDates = expectedWorkoutDates.filter(
    (expectedDate) => !weeklyPlans.some((plan) => getPlanDateInput(plan) === expectedDate)
  );
  const selectedDateIsExpected =
    !date || expectedWorkoutDates.length === 0 || expectedWorkoutDates.includes(date);
  const activeContractStartInput = getDateInputFromRaw(activeWorkoutContract?.startDate);
  const hasCarryOverWorkoutFromPreviousContract = Boolean(
    activeContractStartInput &&
      weeklyPlans.some((plan) => {
        const planDate = getPlanDateInput(plan);
        return Boolean(
          planDate &&
            planDate >= formatDateInput(startOfWeek) &&
            planDate < activeContractStartInput
        );
      })
  );
  const weeklyRemaining =
    weeklyWorkoutLimit == null ? null : Math.max(weeklyWorkoutLimit - weeklyPlansCount, 0);
  const nextWeeklyCount =
    weeklyWorkoutLimit == null ? null : Math.min(weeklyPlansCount + 1, weeklyWorkoutLimit);
  const willCompleteWeekOnSave =
    weeklyWorkoutLimit != null &&
    !isNaN(weeklyWorkoutLimit) &&
    weeklyPlansCount < weeklyWorkoutLimit &&
    weeklyPlansCount + 1 >= weeklyWorkoutLimit;
  const currentWeekRange = getWeekRange(new Date());
  const isFutureWorkoutWeek =
    startOfWeek.getTime() > currentWeekRange.startOfWeek.getTime();
  const isWeeklyLimitReached =
    weeklyWorkoutLimit != null && weeklyPlansCount >= weeklyWorkoutLimit;
  const aiExpectedWorkoutDates = editingWorkoutId
    ? [date].filter(Boolean)
    : (remainingExpectedWorkoutDates.length > 0 ? remainingExpectedWorkoutDates : [date]).filter(Boolean);
  const aiSummaryHref = selectedStudent
    ? `/dashboard/resumo-aluno?studentId=${encodeURIComponent(selectedStudent)}&date=${encodeURIComponent(date || "")}&expectedWorkoutDates=${encodeURIComponent(aiExpectedWorkoutDates.join(","))}${editingWorkoutId ? `&workoutId=${encodeURIComponent(editingWorkoutId)}&mode=edit` : ""}`
    : "/dashboard/resumo-aluno";

  useEffect(() => {
    if (editingWorkoutId) return;
    if (!activeWorkoutContract || expectedWorkoutDates.length === 0) return;

    const selectedDateAlreadyCreated = Boolean(
      date && weeklyPlans.some((plan) => getPlanDateInput(plan) === date)
    );
    const preferredDate = firstMissingExpectedDate || expectedWorkoutDates[0];

    if (!date || !expectedWorkoutDates.includes(date) || selectedDateAlreadyCreated) {
      const safeDate = getNextSafePlanningDateInput(preferredDate);
      setDate(safeDate.dateInput || preferredDate);

      if (safeDate.redirected && safeDate.message) {
        setSafeWindowNotice(safeDate.message);
      } else {
        setSafeWindowNotice(null);
      }
    } else if (!isUnsafeCurrentWeekPlanningDate(date)) {
      setSafeWindowNotice(null);
    }
  }, [
    editingWorkoutId,
    activeWorkoutContract?.id,
    date,
    expectedWorkoutDates.join("|"),
    firstMissingExpectedDate,
    weeklyPlans.map((plan) => getPlanDateInput(plan) || "").join("|"),
  ]);

  // Proteção adicional para lotes importados da IA: se um rascunho for
  // carregado depois da resposta da API e tentar recolocar uma data antiga,
  // a primeira data restante oficial do servidor volta a prevalecer.
  useEffect(() => {
    if (editingWorkoutId || serverExpectedWorkoutDates === null) return;

    const nextServerDate = serverExpectedWorkoutDates.find(
      (candidate) =>
        !weeklyPlans.some((plan) => getPlanDateInput(plan) === candidate)
    );

    if (nextServerDate && date !== nextServerDate) {
      setDate(nextServerDate);
    }
  }, [
    editingWorkoutId,
    serverExpectedWorkoutDates?.join("|") || "",
    weeklyPlans.map((plan) => getPlanDateInput(plan) || "").join("|"),
    date,
  ]);

  useEffect(() => {
    async function fetchWeeklyWorkoutInfo() {
      if (!selectedStudent) {
        setWeeklyPlansCount(0);
        setWeeklyPlans([]);
        setActiveWorkoutContract(null);
        setCareReturnPlanningStart(null);
        setServerExpectedWorkoutDates(null);
        setContractWarning(null);
        return;
      }

      setWeeklyInfoLoading(true);
      setContractWarning(null);

      try {
        const query = new URLSearchParams({
          studentId: selectedStudent,
          summary: "1",
        });

        if (date) {
          query.set("date", date);
        }

        const res = await fetch(`/api/workout-plan?${query.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setWeeklyPlansCount(0);
          setWeeklyPlans([]);
          setActiveWorkoutContract(null);
          setCareReturnPlanningStart(null);
          setServerExpectedWorkoutDates(null);
          setContractWarning("Não foi possível consultar o contrato ativo deste aluno.");
          return;
        }

        const data = (await res.json()) as WorkoutWeekSummary;

        const validWeeklyPlans = Array.isArray(data.plans) ? data.plans : [];
        const uniqueValidPlanDates = new Set(
          validWeeklyPlans
            .map((plan) => getPlanDateInput(plan))
            .filter((planDate): planDate is string => Boolean(planDate))
        ).size;

        setWeeklyPlansCount(uniqueValidPlanDates);
        setWeeklyPlans(validWeeklyPlans);
        setActiveWorkoutContract(data.activeContract || null);
        setCareReturnPlanningStart(
          data.careReturn?.planningStart || data.effectivePlanningStart || null
        );
        setServerExpectedWorkoutDates(
          Array.isArray(data.expectedWorkoutDates)
            ? data.expectedWorkoutDates.filter((value): value is string => Boolean(value))
            : []
        );
        setContractWarning(data.message || null);
      } catch (error) {
        console.error("Erro ao buscar treinos da semana:", error);
        setWeeklyPlansCount(0);
        setWeeklyPlans([]);
        setActiveWorkoutContract(null);
        setCareReturnPlanningStart(null);
        setServerExpectedWorkoutDates(null);
        setContractWarning("Não foi possível consultar o contrato ativo deste aluno.");
      } finally {
        setWeeklyInfoLoading(false);
      }
    }

    fetchWeeklyWorkoutInfo();
  }, [selectedStudent, date]);

  useEffect(() => {
    setReleaseReviewContext(null);
    setReleaseMessage(null);
  }, [selectedStudent, date]);

  useEffect(() => {
    if (editingWorkoutId) return;
    if (!openedFromPendingList || openedFromAiDraft) return;
    if (!selectedStudent || !weeklyWorkoutLimit || weeklyInfoLoading) return;
    if (planName.trim() || exercises.length > 0) return;
    if (!firstMissingExpectedDate) return;

    if (date !== firstMissingExpectedDate) {
      setDate(firstMissingExpectedDate);
    }
  }, [
    editingWorkoutId,
    openedFromPendingList,
    openedFromAiDraft,
    selectedStudent,
    weeklyWorkoutLimit,
    weeklyInfoLoading,
    firstMissingExpectedDate,
    date,
    planName,
    exercises.length,
  ]);

  async function fetchStudents() {
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        const rawStudents = Array.isArray(data) ? data : data.students || data || [];

        setStudents(
          rawStudents.map((student: any) => ({
            id: student.id,
            name: student.name,
            email: student.email,
            image: student.image,
            birthDate: student.birthDate || null,
            ageYears:
              student.ageYears === null || student.ageYears === undefined
                ? null
                : Number(student.ageYears),
            isMinor: Boolean(student.isMinor),
            hasBirthDate: Boolean(student.hasBirthDate || student.birthDate),
            contractedTrainingDaysPerMonth:
              student.contractedTrainingDaysPerMonth ??
              student.contracted_training_days_per_month ??
              null,
            preferredWorkoutDays: Array.isArray(student.preferredWorkoutDays)
              ? student.preferredWorkoutDays
              : [],
            preferredWorkoutDaysLabel: student.preferredWorkoutDaysLabel || null,
          }))
        );
      }
    } catch (e) {
      console.error("Erro ao buscar alunos:", e);
    }
  }

  async function fetchLibrary() {
    try {
      const res = await fetch("/api/exercise-library?active=1", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setLibrary(data.exercises || []);
        setFilteredLibrary(data.exercises || []);
      }
    } catch {}
  }

  function addExercise(ex: LibraryExercise) {
    const newExercise: ExerciseItem = {
      libraryExerciseId: ex.id,
      name: ex.name,
      description: ex.description,
      series: 3,
      reps: "10",
      weight: "",
      restTime: "60s",
      notes: "",
      order: exercises.length,
      imageUrl: ex.imageUrl || null,
      videoUrl: ex.videoUrl || null,
      sequenceImageUrl: ex.sequenceImageUrl || null,
      sequenceImageLabel: ex.sequenceImageLabel || null,
      sequenceImageNotes: ex.sequenceImageNotes || null,
      sequenceFramesCount: ex.sequenceFramesCount || null,
      sequenceGeneratedByAi: Boolean(ex.sequenceGeneratedByAi),
      purpose: buildExercisePurpose(ex),
      instructions: buildExerciseInstructions(ex),
      safetyGuidance: buildExerciseSafetyGuidance(ex),
      commonMistakes: ex.commonMistakes || null,
      contraindications: ex.contraindications || null,
      muscleGroup: ex.muscleGroup || null,
    };
    setExercises([...exercises, newExercise]);
    setShowLibrary(false);
  }

  function removeExercise(index: number) {
    const updated = exercises.filter((_, i) => i !== index);
    setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
  }

  function moveExercise(fromIndex: number, direction: "up" | "down") {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= exercises.length) return;
    const updated = [...exercises];
    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
  }

  function updateExercise(index: number, field: keyof ExerciseItem, value: any) {
    const updated = [...exercises];
    (updated[index] as any)[field] = value;
    setExercises(updated);
  }

  function openWorkoutPrintPreview() {
    if (selectedStudentMissingBirthDate) {
      alert("Data de nascimento não informada. A gestão precisa completar o cadastro antes de montar ou gerar a prévia do treino.");
      return;
    }

    if (!selectedStudent || !planName.trim() || !date || exercises.length === 0) {
      alert("Preencha aluno, nome do treino, data e pelo menos um exercício antes de gerar a prévia.");
      return;
    }

    const studentName = selectedStudentInfo?.name || "Aluno";
    const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(new Date(endOfWeek.getTime() - 1))}`;
    const caloriesLabel =
      estimatedCaloriesMin || estimatedCaloriesMax
        ? `${estimatedCaloriesMin || "-"} a ${estimatedCaloriesMax || "-"} kcal`
        : "Não informado";

    const exercisesHtml = exercises
      .map(
        (exercise, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtmlForPrint(exercise.name)}</strong>
              ${getExercisePurpose(exercise) ? `<br/><span><strong>Pra que serve:</strong> ${escapeHtmlForPrint(getExercisePurpose(exercise))}</span>` : ""}
              ${getExerciseInstructions(exercise) ? `<br/><span><strong>Como executar:</strong> ${escapeHtmlForPrint(getExerciseInstructions(exercise))}</span>` : ""}
              ${getExerciseSafetyGuidance(exercise) ? `<br/><span><strong>Cuidados:</strong> ${escapeHtmlForPrint(getExerciseSafetyGuidance(exercise))}</span>` : ""}
              ${exercise.notes ? `<br/><em>${escapeHtmlForPrint(exercise.notes)}</em>` : ""}
            </td>
            <td>${escapeHtmlForPrint(exercise.series)}</td>
            <td>${escapeHtmlForPrint(exercise.reps)}</td>
            <td>${escapeHtmlForPrint(exercise.weight || "a definir")}</td>
            <td>${escapeHtmlForPrint(exercise.restTime || "-")}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Prévia do treino - ${escapeHtmlForPrint(studentName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #171717; margin: 0; padding: 32px; background: #fff; }
            .header { border-bottom: 3px solid #00A19C; padding-bottom: 16px; margin-bottom: 24px; }
            .brand { color: #007D79; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; }
            h1 { margin: 8px 0 4px; font-size: 24px; }
            h2 { margin: 22px 0 10px; font-size: 16px; color: #007D79; }
            p { margin: 4px 0; line-height: 1.45; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 18px 0; }
            .card { border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; }
            .label { color: #737373; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
            .value { color: #171717; font-size: 14px; font-weight: bold; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th { background: #f5f5f5; text-align: left; padding: 9px; border: 1px solid #e5e5e5; }
            td { vertical-align: top; padding: 9px; border: 1px solid #e5e5e5; }
            em { color: #525252; font-size: 11px; }
            .box { border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; margin-top: 10px; background: #fafafa; }
            .actions { position: sticky; top: 0; background: #fff; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #eee; }
            button { background: #00A19C; border: 0; color: #0a0a0a; font-weight: bold; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
            @media print { .actions { display: none; } body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="actions">
            <button onclick="window.print()">Imprimir / salvar como PDF</button>
          </div>

          <div class="header">
            <div class="brand">Funcional UP Digital</div>
            <h1>${escapeHtmlForPrint(planName)}</h1>
            <p><strong>Aluno:</strong> ${escapeHtmlForPrint(studentName)}</p>
            <p><strong>Idade:</strong> ${escapeHtmlForPrint(selectedStudentInfo?.ageYears ?? "Não informada")} ano(s)${selectedStudentInfo?.isMinor ? " · menor de idade" : ""}</p>
            <p><strong>Data:</strong> ${escapeHtmlForPrint(formatDatePtBr(new Date(date + "T12:00:00")))} · <strong>Semana:</strong> ${escapeHtmlForPrint(weekLabel)}</p>
          </div>

          <div class="grid">
            <div class="card"><div class="label">Contrato/ciclo</div><div class="value">${escapeHtmlForPrint(activeWorkoutContract?.planName || activeWorkoutContract?.type || "Não informado")}</div></div>
            <div class="card"><div class="label">Meta semanal</div><div class="value">${escapeHtmlForPrint(weeklyWorkoutLimit || "-")} treino(s)</div></div>
            <div class="card"><div class="label">Intensidade</div><div class="value">${escapeHtmlForPrint(intensity || "Não informada")}</div></div>
            <div class="card"><div class="label">Duração/calorias</div><div class="value">${escapeHtmlForPrint(estimatedDurationMinutes || "-")} min · ${escapeHtmlForPrint(caloriesLabel)}</div></div>
          </div>

          ${description ? `<h2>Descrição técnica</h2><div class="box">${escapeHtmlForPrint(description)}</div>` : ""}
          ${objective ? `<h2>Objetivo para o aluno</h2><div class="box">${escapeHtmlForPrint(objective)}</div>` : ""}
          ${focusAreas ? `<h2>Foco do treino</h2><div class="box">${escapeHtmlForPrint(focusAreas)}</div>` : ""}
          ${studentSummary ? `<h2>Resumo humanizado</h2><div class="box">${escapeHtmlForPrint(studentSummary)}</div>` : ""}
          ${safetyNote ? `<h2>Segurança</h2><div class="box">${escapeHtmlForPrint(safetyNote)}</div>` : ""}
          ${notes ? `<h2>Observações do professor</h2><div class="box">${escapeHtmlForPrint(notes)}</div>` : ""}

          <h2>Exercícios</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Exercício</th>
                <th>Séries</th>
                <th>Reps</th>
                <th>Carga</th>
                <th>Descanso</th>
              </tr>
            </thead>
            <tbody>${exercisesHtml}</tbody>
          </table>

          <p style="margin-top:24px; color:#737373; font-size:11px;">
            Prévia para revisão do professor. Este documento não substitui avaliação individual, orientação profissional ou ajustes necessários conforme dor, restrição, ambiente e equipamentos disponíveis. Gasto calórico é estimado e pode variar.
          </p>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      alert("Não foi possível abrir a prévia. Verifique se o navegador bloqueou pop-up.");
      return;
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }


  async function releaseWeek(forceRelease = false) {
    if (!selectedStudent || !date) {
      setReleaseMessage({
        type: "error",
        text: "Selecione aluno e data/semana antes de liberar.",
      });
      return;
    }

    if (selectedStudentMissingBirthDate) {
      setReleaseMessage({
        type: "error",
        text: "Data de nascimento não informada. A gestão precisa completar o cadastro antes de liberar a semana.",
      });
      return;
    }

    if (isUnsafeCurrentWeekPlanningDate(date)) {
      setReleaseMessage({
        type: "error",
        text: "Esta semana já não possui janela segura de execução. Direcione a liberação para a próxima semana.",
      });
      return;
    }

    setReleaseLoading(true);
    setReleaseMessage(null);

    try {
      const res = await fetch("/api/workout-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RELEASE_WEEK",
          studentId: selectedStudent,
          date,
          forceRelease,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setReleaseReviewContext(data?.reviewContext || null);
        setReleaseMessage({
          type: "success",
          text: data?.message || "Semana liberada para o aluno.",
        });
        setSuccess(data?.message || "Semana liberada para o aluno.");
        setTimeout(() => setSuccess(null), 7000);
        return;
      }

      if (res.status === 409 && data?.reviewRequired) {
        setReleaseReviewContext(data.reviewContext || null);
        setReleaseMessage({
          type: "warning",
          text: data?.error || "Revisão obrigatória antes de liberar a semana.",
        });
        return;
      }

      setReleaseMessage({
        type: "error",
        text: data?.error || "Não foi possível liberar a semana.",
      });
    } catch {
      setReleaseMessage({
        type: "error",
        text: "Erro ao liberar a semana. Tente novamente.",
      });
    } finally {
      setReleaseLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !planName.trim() || exercises.length === 0) return;

    if (selectedStudentMissingBirthDate) {
      alert("Data de nascimento não informada. A gestão precisa completar o cadastro antes de montar o treino.");
      return;
    }

    if (!activeWorkoutContract || !weeklyWorkoutLimit) {
      alert(
        contractWarning ||
          "Este aluno não possui contrato ativo para a data do treino. Regularize o ciclo no Financeiro antes de montar novos treinos."
      );
      return;
    }

    const selectedDateAlreadyCreatedForSave = Boolean(
      date && weeklyPlans.some((plan) => getPlanDateInput(plan) === date)
    );

    // Se o servidor já devolveu as datas restantes oficiais da semana, ele é
    // a fonte soberana também no instante do salvamento. Isso impede que um
    // rascunho/estado visual antigo (ex.: 23/08) seja enviado quando a API já
    // informou que a vaga correta é 19/08.
    const serverFirstMissingExpectedDate = serverExpectedWorkoutDates?.find(
      (candidate) =>
        !weeklyPlans.some((plan) => getPlanDateInput(plan) === candidate)
    ) || null;

    let dateToSave = editingWorkoutId
      ? date
      : serverFirstMissingExpectedDate ||
        ((
          date &&
          expectedWorkoutDates.includes(date) &&
          !selectedDateAlreadyCreatedForSave
        )
          ? date
          : firstMissingExpectedDate || date);

    // Proteção final da retomada no cliente. Mesmo que uma URL/rascunho antigo
    // ainda traga 03/08, nunca enviamos uma data anterior à liberação. Se hoje
    // está dentro da mesma semana, usamos hoje como fallback, inclusive no fim de semana.
    if (!editingWorkoutId && careReturnPlanningStart && dateToSave) {
      const todayInput = getSaoPauloCivilDateInput();
      const todayDate = parseDateInput(todayInput);
      const selectedWeek = getWeekRange(parseDateInput(dateToSave) || new Date());
      const todayWeek = todayDate ? getWeekRange(todayDate) : null;
      const todayAlreadyCreated = weeklyPlans.some(
        (plan) => getPlanDateInput(plan) === todayInput
      );
      const sameCurrentWeek = Boolean(
        todayWeek &&
        formatDateInput(todayWeek.startOfWeek) === formatDateInput(selectedWeek.startOfWeek)
      );

      if (dateToSave < careReturnPlanningStart) {
        const validMissing = expectedWorkoutDates.find(
          (candidate) =>
            candidate >= careReturnPlanningStart &&
            !weeklyPlans.some((plan) => getPlanDateInput(plan) === candidate)
        );

        if (validMissing) {
          dateToSave = validMissing;
        } else if (selectedStudentInfo?.preferredWorkoutDays?.length) {
          // Com rotina estruturada, nunca compensamos a retomada em um dia não escolhido.
          dateToSave = "";
        } else if (
          sameCurrentWeek &&
          todayInput >= careReturnPlanningStart &&
          !todayAlreadyCreated
        ) {
          dateToSave = todayInput;
        }
      }
    }

    if (!dateToSave) {
      alert("Não há uma data válida restante para salvar este treino nesta semana.");
      return;
    }

    if (dateToSave !== date) {
      setDate(dateToSave);
    }

    if (isUnsafeCurrentWeekPlanningDate(dateToSave)) {
      alert("Esta semana já não possui janela segura de execução. Planeje a próxima semana para não iniciar o aluno atrasado.");
      return;
    }

    if (library.length === 0) {
      alert("A biblioteca de exercícios está vazia. Cadastre exercícios antes de montar treino manual ou por IA.");
      return;
    }

    const exerciseWithoutLibrary = exercises.find((exercise) => !exercise.libraryExerciseId);

    if (exerciseWithoutLibrary) {
      alert("Todos os exercícios precisam vir da Biblioteca de Exercícios. Remova exercícios soltos e selecione novamente pela biblioteca.");
      return;
    }

    if (isWeeklyLimitReached && !editingWorkoutId) {
      alert(
        `Este aluno já recebeu ${weeklyPlansCount} treino(s) nesta semana. O limite atual é de ${weeklyWorkoutLimit} treino(s) por semana.`
      );
      return;
    }
    setSaving(true);
    setSuccess(null);
    try {
      const res = await fetch("/api/workout-plan", {
        method: editingWorkoutId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingWorkoutId ? { id: editingWorkoutId } : {}),
          studentId: selectedStudent,
          name: planName.trim(),
          description: description || null,
          date: dateToSave || null,
          objective: objective || null,
          focusAreas: focusAreas || null,
          intensity: intensity || null,
          estimatedDurationMinutes: estimatedDurationMinutes ? Number(estimatedDurationMinutes) : null,
          estimatedCaloriesMin: estimatedCaloriesMin ? Number(estimatedCaloriesMin) : null,
          estimatedCaloriesMax: estimatedCaloriesMax ? Number(estimatedCaloriesMax) : null,
          studentSummary: studentSummary || null,
          safetyNote: safetyNote || null,
          notes: notes || null,
          exercises: exercises.map((ex) => ({
            libraryExerciseId: ex.libraryExerciseId,
            exerciseId: ex.libraryExerciseId,
            name: ex.name,
            description: ex.description,
            series: ex.series,
            reps: ex.reps || null,
            weight: ex.weight || null,
            restTime: ex.restTime || null,
            notes: ex.notes || null,
            order: ex.order,
            imageUrl: ex.imageUrl || null,
            videoUrl: ex.videoUrl || null,
            purpose: getExercisePurpose(ex) || null,
            instructions: getExerciseInstructions(ex) || null,
            safetyGuidance: getExerciseSafetyGuidance(ex) || null,
            commonMistakes: ex.commonMistakes || null,
            contraindications: ex.contraindications || null,
          })),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const nextAuthoritativeDates = Array.isArray(result?.expectedWorkoutDates)
          ? result.expectedWorkoutDates.filter((value: unknown): value is string => Boolean(value))
          : [];
        const savedAuthoritativeDate =
          typeof result?.savedWorkoutDate === "string" && result.savedWorkoutDate
            ? result.savedWorkoutDate
            : getCivilDateInput(result?.date) || dateToSave;

        if (!editingWorkoutId && Array.isArray(result?.expectedWorkoutDates)) {
          setServerExpectedWorkoutDates(nextAuthoritativeDates);
        }

        if (editingWorkoutId) {
          if (openedFromAiDraft) {
            clearAiWorkoutDraft();
          }
          setSuccess("Treino atualizado com sucesso. Voltando ao dashboard...");
          window.setTimeout(() => {
            window.location.replace("/dashboard");
          }, 700);
          return;
        }

        const weeklyMessage =
          result?.weeklyNotification?.message ||
          "Treino salvo com sucesso.";

        const aiBatchHasNextWorkout =
          openedFromAiDraft &&
          aiDraftBatch &&
          aiDraftIndex + 1 < aiDraftBatch.workouts.length;

        /*
         * A meta semanal é soberana sobre o lote da IA. Se este salvamento
         * completa a semana, encerramos a montagem e voltamos ao dashboard
         * mesmo que exista um rascunho antigo com treinos extras. Isso evita
         * prender o professor na tela por um pacote gerado antes da contagem
         * atualizada da semana.
         */
        const shouldReturnToDashboardAfterSave = willCompleteWeekOnSave;
        const hasNextAiWorkout = aiBatchHasNextWorkout && !shouldReturnToDashboardAfterSave;

        const normalizedDateMessage = result?.normalizedWorkoutDateFrom && savedAuthoritativeDate
          ? ` Data ajustada automaticamente para ${formatDatePtBr(new Date(`${savedAuthoritativeDate}T12:00:00`))} conforme a programação do aluno.`
          : "";

        setSuccess(
          hasNextAiWorkout
            ? `${weeklyMessage}${normalizedDateMessage} Próximo treino sugerido pela IA carregado para revisão.`
            : shouldReturnToDashboardAfterSave
              ? `${weeklyMessage}${normalizedDateMessage} Montagem concluída. ${getNextBatchDestination() ? "Voltando para o lote..." : "Voltando ao dashboard..."}`
              : `${weeklyMessage}${normalizedDateMessage}`
        );

        if (hasNextAiWorkout && aiDraftBatch) {
          loadAiDraftByIndex(aiDraftIndex + 1);

          // O servidor acabou de recalcular a programação após o treino salvo.
          // Essa data prevalece sobre qualquer estado antigo da tela/rascunho.
          if (nextAuthoritativeDates.length > 0) {
            setDate(nextAuthoritativeDates[0]);
          }
        } else {
          setPlanName("");
          if (!openedFromPendingList && !openedFromAiDraft) {
            setDate("");
          }
          setDescription("");
          setObjective("");
          setFocusAreas("");
          setIntensity("");
          setEstimatedDurationMinutes("");
          setEstimatedCaloriesMin("");
          setEstimatedCaloriesMax("");
          setStudentSummary("");
          setSafetyNote("");
          setNotes("");
          setExercises([]);

          if (openedFromAiDraft) {
            clearAiWorkoutDraft();
          }
        }

        const savedPlanId =
          result?.workoutPlan?.id ||
          result?.plan?.id ||
          result?.workout?.id ||
          `temp-${Date.now()}`;

        setWeeklyPlans((current) => [
          ...current,
          {
            id: savedPlanId,
            date: savedAuthoritativeDate || null,
          },
        ]);
        setWeeklyPlansCount((current) => current + 1);

        const nextMissingDateAfterSave = nextAuthoritativeDates[0] || getFirstMissingExpectedDate(
          expectedWorkoutDates,
          [
            ...weeklyPlans,
            {
              id: savedPlanId,
              date: savedAuthoritativeDate || null,
            },
          ]
        );

        if (
          openedFromPendingList &&
          !hasNextAiWorkout &&
          nextMissingDateAfterSave &&
          nextMissingDateAfterSave !== dateToSave
        ) {
          setDate(nextMissingDateAfterSave);
        }

        if (shouldReturnToDashboardAfterSave) {
          const nextBatchDestination = getNextBatchDestination();
          window.setTimeout(() => {
            window.location.replace(nextBatchDestination || "/dashboard");
          }, 900);
          return;
        }

        setTimeout(() => setSuccess(null), 7000);
      } else {
        const err = await res.json();
        const authoritativeDatesFromError = Array.isArray(err?.expectedWorkoutDates)
          ? err.expectedWorkoutDates.filter((value: unknown): value is string => Boolean(value))
          : [];

        if (authoritativeDatesFromError.length > 0) {
          setServerExpectedWorkoutDates(authoritativeDatesFromError);
          setDate(authoritativeDatesFromError[0]);
        }

        alert(`Erro ao salvar: ${err.error}`);
      }
    } catch {
      alert("Erro ao salvar treino.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#00A19C]">
          {editingWorkoutId ? "✏️ Editar Treino" : "📋 Montar Treino"}
        </h1>
        <p className="text-[#a1a1a1] mt-1">
          {editingWorkoutId
            ? "Altere o treino existente sem criar um quarto treino. Ao salvar, você volta automaticamente ao dashboard."
            : "Monte os treinos da semana. Treinos futuros ficam planejados para professor/gestão e só aparecem para o aluno na semana correta."}
        </p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg p-4 mb-6">
          ✅ {success}
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#00A19C] mb-1">
              Contexto da montagem
            </p>
            <h2 className="text-lg font-semibold text-[#f5f5f5]">
              {selectedStudent
                ? `Você está montando treino da ${pendingWeekLabelFromUrl || weekScopeLabel}`
                : "Selecione um aluno para iniciar a montagem"}
            </h2>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Semana de {formatDatePtBr(startOfWeek)} a{" "}
              {formatDatePtBr(new Date(endOfWeek.getTime() - 1))}.
              {openedFromPendingList
                ? " Esta tela foi aberta a partir de uma pendência real do dashboard."
                : " Para maior segurança, prefira iniciar pelo card de pendências do dashboard."}
            </p>
            {safeWindowNotice && (
              <p className="text-xs text-amber-400 mt-2">
                {safeWindowNotice}
              </p>
            )}
          </div>

          {selectedStudent && (
            <div className="rounded-lg bg-[#0a0a0a] border border-[#ffffff10] p-3 text-xs text-[#a1a1a1] min-w-[220px]">
              <p>
                Aluno:{" "}
                <span className="text-[#f5f5f5] font-semibold">
                  {selectedStudentInfo?.name || "carregando..."}
                </span>
              </p>
              <p className="mt-1">
                Meta:{" "}
                <span className="text-[#f5f5f5] font-semibold">
                  {weeklyWorkoutLimit ? `${weeklyWorkoutLimit} treino(s)/semana` : "carregando"}
                </span>
              </p>
              <p className="mt-1">
                Criados:{" "}
                <span className="text-[#f5f5f5] font-semibold">
                  {weeklyPlansCount}
                  {weeklyWorkoutLimit ? `/${weeklyWorkoutLimit}` : ""}
                </span>
              </p>
              {editingWorkoutId && (
                <p className="mt-2 rounded-md bg-blue-500/10 px-2 py-1 text-blue-300">
                  Modo edição: este salvamento substitui o treino atual e não aumenta a contagem semanal.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {openedFromAiDraft && aiDraftBatch && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm rounded-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <p className="font-semibold text-blue-300">
                Rascunho importado da IA para revisão do professor
              </p>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Treino {aiDraftIndex + 1} de {aiDraftBatch.workouts.length}. Revise aluno, data,
                exercícios, séries, repetições, carga e observações antes de salvar.
              </p>

              {aiDraftBatch.scheduleDescription && (
                <p className="text-xs text-blue-200 mt-2">
                  {aiDraftBatch.scheduleDescription}
                </p>
              )}

              {aiDraftBatch.scheduleWarning && (
                <p className="text-xs text-yellow-300 mt-2">
                  {aiDraftBatch.scheduleWarning}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {aiDraftBatch.workouts.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => loadAiDraftByIndex(aiDraftIndex - 1)}
                    disabled={aiDraftIndex === 0}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white disabled:opacity-40"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    onClick={() => loadAiDraftByIndex(aiDraftIndex + 1)}
                    disabled={aiDraftIndex >= aiDraftBatch.workouts.length - 1}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] hover:text-white disabled:opacity-40"
                  >
                    Próximo
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={clearAiWorkoutDraft}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                Limpar rascunho IA
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#00A19C] mb-4">👤 Aluno e Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Selecione o aluno *</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                required
                disabled={lockStudentSelection}
                className={
                  "w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C] " +
                  (lockStudentSelection ? "opacity-80 cursor-not-allowed" : "")
                }
              >
                <option value="">Selecione um aluno...</option>
                {selectedStudent && !students.some((s) => s.id === selectedStudent) && (
                  <option value={selectedStudent}>Aluno selecionado pelo dashboard</option>
                )}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.ageYears === null || s.ageYears === undefined ? "nascimento pendente" : `${s.ageYears} ano(s)`}
                  </option>
                ))}
              </select>

              {(openedFromPendingList || openedFromAiDraft) && selectedStudent && (
                <div className="mt-2 rounded-lg border border-[#00A19C]/20 bg-[#00A19C]/10 p-2">
                  <p className="text-[11px] text-[#00A19C] font-medium">
                    Aluno selecionado automaticamente {openedFromAiDraft ? "pelo rascunho da IA" : "pelo dashboard"}:
                    <span className="text-[#f5f5f5] ml-1">
                      {selectedStudentInfo?.name || "carregando aluno..."}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLockStudentSelection(false);
                      setOpenedFromPendingList(false);
                      setPendingWeekLabelFromUrl(null);
                      setOpenedFromAiDraft(false);
                    }}
                    className="text-[10px] text-[#a1a1a1] hover:text-white underline mt-1"
                  >
                    Trocar aluno manualmente
                  </button>
                </div>
              )}
            </div>

            {selectedStudent && selectedStudentInfo && (
              <div
                className={
                  "md:col-span-2 rounded-lg border p-4 " +
                  (selectedStudentMissingBirthDate
                    ? "border-red-500/30 bg-red-500/10"
                    : "border-[#00A19C]/20 bg-[#00A19C]/10")
                }
              >
                <p className={"text-sm font-semibold " + (selectedStudentMissingBirthDate ? "text-red-300" : "text-[#00A19C]")}>
                  {selectedStudentMissingBirthDate
                    ? "Data de nascimento obrigatória"
                    : `Aluno: ${selectedStudentInfo.name} · ${selectedStudentInfo.ageYears} ano(s)${selectedStudentInfo.isMinor ? " · menor de idade" : ""}`}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#a1a1a1]">
                  {selectedStudentMissingBirthDate
                    ? "A montagem manual, o resumo IA e a liberação da semana estão bloqueados até a gestão completar a data de nascimento."
                    : "A idade deve ser considerada junto com objetivo, histórico, adesão, dores, restrições e resposta aos treinos anteriores."}
                </p>
              </div>
            )}

            {selectedStudent && (
              <div className="md:col-span-2 bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#00A19C]">
                      📆 Programação semanal do aluno
                    </p>

                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Semana de {formatDatePtBr(startOfWeek)} a{" "}
                      {formatDatePtBr(new Date(endOfWeek.getTime() - 1))}
                    </p>
                  </div>

                  {weeklyInfoLoading ? (
                    <span className="text-xs text-[#a1a1a1]">
                      Carregando treinos da semana...
                    </span>
                  ) : weeklyWorkoutLimit ? (
                    <span
                      className={
                        "text-xs font-bold px-3 py-1 rounded-full " +
                        (editingWorkoutId
                          ? "bg-blue-500/10 text-blue-300"
                          : isWeeklyLimitReached
                          ? "bg-red-500/10 text-red-400"
                          : "bg-emerald-500/10 text-emerald-400")
                      }
                    >
                      {weeklyPlansCount}/{weeklyWorkoutLimit} treino(s) criados nesta semana
                      {editingWorkoutId ? " · editando um existente" : ""}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-500/10 text-red-400">
                      Contrato sem quantidade definida
                    </span>
                  )}
                </div>

                {weeklyWorkoutLimit ? (
                  <>
                    <p className="text-xs text-[#a1a1a1] mt-3">
                    Contrato ativo:{" "}
                    <span className="text-[#f5f5f5] font-semibold">
                      {activeWorkoutContract?.planName ||
                        (activeWorkoutContract?.type === "TRIAL" ? "Experiência gratuita" : "Plano pago")}
                    </span>{" "}
                    · {activeWorkoutContract?.workoutsPerWeek || weeklyWorkoutLimit} treino(s)/semana ·{" "}
                    {activeWorkoutContract?.totalContractedWorkouts || "-"} treino(s) no ciclo. Para esta semana,
                    ainda falta(m){" "}
                    <span className="text-[#f5f5f5] font-semibold">
                      {weeklyRemaining}
                    </span>{" "}
                    treino(s).
                  </p>

                  {selectedStudentInfo?.preferredWorkoutDays && selectedStudentInfo.preferredWorkoutDays.length > 0 && (
                    <p className="mt-2 text-[11px] text-[#00A19C]">
                      Rotina escolhida no cadastro: {formatPreferredWorkoutDays(selectedStudentInfo.preferredWorkoutDays)}.
                    </p>
                  )}

                  {expectedWorkoutDates.length > 0 && (
                    <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#111111] p-3">
                      <p className="text-[11px] text-[#a1a1a1] mb-2">
                        Dias programados para este aluno nesta semana:
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {expectedWorkoutDates.map((expectedDate) => {
                          const alreadyCreated = weeklyPlans.some(
                            (plan) => getPlanDateInput(plan) === expectedDate
                          );
                          const isSelected = date === expectedDate;

                          return (
                            <button
                              key={expectedDate}
                              type="button"
                              onClick={() => setDate(expectedDate)}
                              disabled={alreadyCreated}
                              className={
                                "rounded-lg px-3 py-1.5 text-[11px] border transition " +
                                (isSelected
                                  ? "bg-[#00A19C] text-[#0a0a0a] border-[#00A19C]"
                                  : alreadyCreated
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-not-allowed"
                                    : "bg-[#1a1a1a] text-[#a1a1a1] border-[#ffffff10] hover:text-[#f5f5f5]")
                              }
                            >
                              {formatDatePtBr(new Date(`${expectedDate}T12:00:00`))}
                              {alreadyCreated ? " · criado" : isSelected ? " · selecionado" : ""}
                            </button>
                          );
                        })}
                      </div>

                      {activeWorkoutContract?.startDate && getDateInputFromRaw(activeWorkoutContract.startDate) && getDateInputFromRaw(activeWorkoutContract.startDate)! > formatDateInput(startOfWeek) && (
                        <p className="text-[11px] text-[#a1a1a1] mt-2">
                          {hasCarryOverWorkoutFromPreviousContract || weeklyPlansCount > 0
                            ? "O plano mudou no meio da semana. Os treinos anteriores continuam contando e a nova meta semanal já vale nesta semana."
                            : "O contrato começou no meio da semana. Por isso, o sistema considera somente datas disponíveis a partir do início do contrato, inclusive sábado ou domingo quando aplicável."}
                        </p>
                      )}

                      {careReturnPlanningStart && (
                        <p className="text-[11px] text-emerald-400 mt-2">
                          Retomada liberada em {formatDatePtBr(new Date(`${careReturnPlanningStart}T12:00:00`))}.
                          Treinos anteriores a essa data não contam como nova programação; o sistema usa somente as datas restantes da semana, inclusive o fim de semana quando aplicável.
                        </p>
                      )}

                      {!selectedDateIsExpected && (
                        <p className="text-[11px] text-amber-400 mt-2">
                          A data selecionada não está entre as datas válidas automaticamente para esta semana.
                          Revise antes de salvar.
                        </p>
                      )}

                      {weekScopeLabel === "semana atual" && ["Sat", "Sun"].includes(getWeekdayInSaoPaulo()) ? (
                        <p className="text-[11px] text-emerald-400 mt-2">
                          Se sábado ou domingo estiver na rotina do aluno, o treino daquele dia pode ser programado e concluído no fim de semana sem reabrir os treinos de segunda a sexta.
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div
                    className={
                      "mt-3 rounded-lg border p-3 text-xs " +
                      (isWeeklyLimitReached
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : willCompleteWeekOnSave
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-400")
                    }
                  >
                    {isWeeklyLimitReached
                      ? isFutureWorkoutWeek
                        ? "Semana futura pré-planejada. Antes de liberar para o aluno, revise dados atualizados, execução da semana anterior, dúvidas e eventos de cuidado."
                        : "Semana completa. Se necessário, use a revisão final para confirmar dados atualizados antes de liberar ou reenviar a programação."
                      : willCompleteWeekOnSave
                        ? isFutureWorkoutWeek
                          ? "Ao salvar este treino, a meta da semana futura ficará completa como pré-planejamento. O aluno ainda não será notificado até a revisão/liberação final."
                          : "Ao salvar este treino, a meta semanal será completa e o aluno será notificado com um único e-mail."
                        : isFutureWorkoutWeek
                          ? "Este treino futuro será salvo como pré-planejamento. Antes da liberação, o sistema poderá exigir revisão dos dados atualizados do aluno."
                          : "Este treino será salvo, mas o aluno ainda não será notificado. O aviso será enviado somente quando todos os treinos da semana forem criados."}
                  </div>

                  {isWeeklyLimitReached && (
                    <div className="mt-3 rounded-lg border border-[#00A19C]/20 bg-[#00A19C]/10 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#00A19C]">
                            Revisão final da semana
                          </p>
                          <p className="text-xs text-[#a1a1a1] mt-1">
                            Use esta etapa para liberar a semana somente depois de conferir se houve dados novos: execução dos treinos anteriores, dúvidas, dor/desconforto, eventos de cuidado ou alteração na ficha do aluno.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => releaseWeek(false)}
                          disabled={releaseLoading || !selectedStudent || !date}
                          className="inline-flex items-center justify-center rounded-lg bg-[#00A19C] px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87] transition disabled:opacity-50"
                        >
                          {releaseLoading ? "Verificando..." : "Revisar e liberar semana"}
                        </button>
                      </div>

                      {releaseMessage && (
                        <div
                          className={
                            "mt-3 rounded-lg border p-3 text-xs " +
                            (releaseMessage.type === "success"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : releaseMessage.type === "warning"
                                ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                : "border-red-500/20 bg-red-500/10 text-red-400")
                          }
                        >
                          {releaseMessage.text}
                        </div>
                      )}

                      {releaseReviewContext && (
                        <div className="mt-3 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-3 text-xs text-[#a1a1a1] space-y-2">
                          <p className="font-semibold text-[#f5f5f5]">
                            Dados considerados na revisão
                          </p>

                          {releaseReviewContext.previousWeek?.label && (
                            <p>
                              Semana anterior analisada: <span className="text-[#f5f5f5]">{releaseReviewContext.previousWeek.label}</span>
                            </p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="rounded-lg bg-[#111111] border border-[#ffffff10] p-2">
                              <p className="text-[10px] uppercase text-[#6b6b6b]">Treinos anteriores</p>
                              <p className="text-[#f5f5f5] font-semibold">
                                {releaseReviewContext.previousWeekWorkouts ?? 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[#111111] border border-[#ffffff10] p-2">
                              <p className="text-[10px] uppercase text-[#6b6b6b]">Concluídos</p>
                              <p className="text-emerald-400 font-semibold">
                                {releaseReviewContext.completedPreviousWeek ?? 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[#111111] border border-[#ffffff10] p-2">
                              <p className="text-[10px] uppercase text-[#6b6b6b]">Pendentes/não concluídos</p>
                              <p className="text-amber-400 font-semibold">
                                {releaseReviewContext.pendingPreviousWeek ?? 0}
                              </p>
                            </div>
                          </div>

                          {releaseReviewContext.stalePrescriptionBecauseOfNewContext && (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 space-y-3">
                              <div>
                                <p className="font-semibold text-red-300">
                                  Contexto novo depois que o treino foi montado
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-red-100/80">
                                  Este treino foi criado antes de uma nova dúvida, evento de cuidado, execução ou atualização do aluno. Antes de liberar, gere novo resumo IA com o contexto atualizado ou ajuste manualmente a prescrição.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div className="rounded-lg bg-[#111111] border border-red-500/20 p-2">
                                  <p className="text-[10px] uppercase text-red-200/70">Novos eventos</p>
                                  <p className="text-red-200 font-semibold">
                                    {releaseReviewContext.newCareEventsAfterPlanning ?? 0}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-[#111111] border border-red-500/20 p-2">
                                  <p className="text-[10px] uppercase text-red-200/70">Novas dúvidas</p>
                                  <p className="text-red-200 font-semibold">
                                    {releaseReviewContext.newStudentQuestionsAfterPlanning ?? 0}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-[#111111] border border-red-500/20 p-2">
                                  <p className="text-[10px] uppercase text-red-200/70">Dor/torção</p>
                                  <p className="text-red-200 font-semibold">
                                    {releaseReviewContext.newPainQuestionsAfterPlanning ?? 0}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col md:flex-row gap-2">
                                <a
                                  href={aiSummaryHref}
                                  onClick={(event) => {
                                    if (selectedStudentMissingBirthDate) {
                                      event.preventDefault();
                                      alert("Informe a data de nascimento antes de gerar o resumo IA.");
                                    }
                                  }}
                                  aria-disabled={selectedStudentMissingBirthDate}
                                  className={
                                    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition " +
                                    (selectedStudentMissingBirthDate
                                      ? "cursor-not-allowed bg-[#00A19C]/30 text-[#6b6b6b]"
                                      : "bg-[#00A19C] text-[#0a0a0a] hover:bg-[#008B87]")
                                  }
                                >
                                  {selectedStudentMissingBirthDate ? "Data de nascimento pendente" : "Gerar novo resumo IA com alerta atualizado"}
                                </a>

                                <button
                                  type="button"
                                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                  className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition"
                                >
                                  Ajustar manualmente este treino
                                </button>
                              </div>

                              <p className="text-[10px] leading-relaxed text-red-100/70">
                                Pausa por cuidado aberta continua bloqueando totalmente a liberação. Para outros alertas, a liberação só deve seguir depois de nova IA ou revisão/ajuste manual do professor.
                              </p>
                            </div>
                          )}

                          {releaseReviewContext.reviewAlerts && releaseReviewContext.reviewAlerts.length > 0 ? (
                            <div>
                              <p className="text-amber-400 font-semibold mb-1">
                                Pontos que exigem atenção antes de liberar:
                              </p>
                              <ul className="list-disc pl-5 space-y-1">
                                {releaseReviewContext.reviewAlerts.map((alert, index) => (
                                  <li key={index}>{alert}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-emerald-400">
                              Nenhum alerta crítico encontrado desde o pré-planejamento.
                            </p>
                          )}

                          {releaseReviewContext.requiresReviewBeforeRelease && (
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2 border-t border-[#ffffff10]">
                              <p className="text-xs text-[#a1a1a1]">
                                Após revisar os pontos acima, confirme para liberar a semana mesmo com alertas registrados.
                              </p>

                              <button
                                type="button"
                                onClick={() => releaseWeek(true)}
                                disabled={releaseLoading}
                                className="inline-flex items-center justify-center rounded-lg bg-emerald-500/90 px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-emerald-400 transition disabled:opacity-50"
                              >
                                {releaseLoading
                                  ? "Liberando..."
                                  : releaseReviewContext.stalePrescriptionBecauseOfNewContext
                                    ? "Confirmo que revisei/ajustei e quero liberar"
                                    : "Confirmo que revisei e quero liberar"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <p className="text-xs text-red-400 mt-3">
                    {contractWarning ||
                      "Este aluno não possui contrato ativo para a data selecionada. Regularize o ciclo no Financeiro antes de montar novos treinos."}
                  </p>
                )}
              </div>
            )}

            {selectedStudent && date && (
              <div className="md:col-span-2 rounded-xl border border-[#00A19C]/20 bg-[#00A19C]/10 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#00A19C]">
                      Quer usar IA para montar esta semana?
                    </p>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Gere o resumo do aluno já com este contexto de aluno e semana.
                      Depois cole o JSON de volta aqui para revisão do professor antes de salvar.
                    </p>
                  </div>

                  <a
                    href={aiSummaryHref}
                    onClick={(event) => {
                      if (selectedStudentMissingBirthDate) {
                        event.preventDefault();
                        alert("Informe a data de nascimento antes de gerar o resumo IA.");
                      }
                    }}
                    aria-disabled={selectedStudentMissingBirthDate}
                    className={
                      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition " +
                      (selectedStudentMissingBirthDate
                        ? "cursor-not-allowed bg-[#00A19C]/30 text-[#6b6b6b]"
                        : "bg-[#00A19C] text-[#0a0a0a] hover:bg-[#008B87]")
                    }
                  >
                    {selectedStudentMissingBirthDate ? "Data de nascimento pendente" : "Gerar por IA"}
                  </a>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Nome do treino *</label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Ex: Treino A - Segunda"
                required
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Data do treino *</label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setDate(nextDate);
                    setSafeWindowNotice(
                      isUnsafeCurrentWeekPlanningDate(nextDate)
                        ? "Esta semana já não possui janela segura de execução. Planeje a próxima semana para não iniciar o aluno atrasado."
                        : null
                    );
                  }}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C] [color-scheme:dark]"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00A19C] pointer-events-none text-lg">
                  📅
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Descrição <span className="text-[#525252]">(opcional)</span></label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Treino de membros superiores"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#00A19C] mb-2">
            ✨ Resumo inteligente para o aluno
          </h2>
          <p className="text-xs text-[#a1a1a1] mb-4">
            Esse bloco aparece para o aluno junto com o treino. Use linguagem simples e acolhedora.
            O gasto energético deve ser uma faixa estimada, nunca uma promessa.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm text-[#e5e5e5] block mb-1">Objetivo da sessão</label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Ex: melhorar resistência muscular e retomar consistência"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Foco do treino</label>
              <input
                type="text"
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
                placeholder="Ex: pernas, glúteos, core e condicionamento"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Intensidade esperada</label>
              <select
                value={intensity}
                onChange={(e) => setIntensity(e.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]"
              >
                <option value="">Selecione...</option>
                <option value="Leve">Leve</option>
                <option value="Moderada">Moderada</option>
                <option value="Alta">Alta</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Duração estimada em minutos</label>
              <input
                type="number"
                min="5"
                max="180"
                value={estimatedDurationMinutes}
                onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                placeholder="Ex: 40"
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Gasto estimado em kcal</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={estimatedCaloriesMin}
                  onChange={(e) => setEstimatedCaloriesMin(e.target.value)}
                  placeholder="mín."
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                />
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={estimatedCaloriesMax}
                  onChange={(e) => setEstimatedCaloriesMax(e.target.value)}
                  placeholder="máx."
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
                />
              </div>
              <p className="text-[10px] text-[#6b6b6b] mt-1">
                Exiba como faixa estimada. Evite número exato.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-[#e5e5e5] block mb-1">Resumo para o aluno</label>
              <textarea
                value={studentSummary}
                onChange={(e) => setStudentSummary(e.target.value)}
                rows={3}
                placeholder="Ex: O foco de hoje é fazer bem feito, manter constância e terminar o treino com sensação de evolução."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-[#e5e5e5] block mb-1">Observação de segurança</label>
              <textarea
                value={safetyNote}
                onChange={(e) => setSafetyNote(e.target.value)}
                rows={2}
                placeholder="Ex: Se sentir dor ou desconforto fora do esperado, pare e avise o professor."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              />
            </div>
          </div>
        </div>

        {exercises.length > 0 && (
          <WorkoutMuscleMap
            exercises={exercises}
            title="Distribuição muscular antes de liberar"
          />
        )}

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#00A19C]">🏋️ Exercícios</h2>
            <button
              type="button"
              onClick={() => setShowLibrary(!showLibrary)}
              className="bg-[#00A19C] text-[#0a0a0a] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#008B87] transition"
            >
              {showLibrary ? "Fechar biblioteca" : "+ Adicionar exercício"}
            </button>
          </div>

          {showLibrary && (
            <div className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4 mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Buscar exercício por nome ou grupo muscular..."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C] mb-3"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {filteredLibrary.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => addExercise(ex)}
                    className="text-left bg-[#1a1a1a] border border-[#ffffff10] rounded-lg p-3 hover:border-[#00A19C]/50 transition text-sm"
                  >
                    <p className="text-[#f5f5f5] font-medium">{ex.name}</p>
                    <p className="text-[#a1a1a1] text-xs mt-0.5">{ex.muscleGroup}</p>
                    {buildExercisePurpose(ex) && (
                      <p className="text-[#6b6b6b] text-[10px] mt-1 line-clamp-2">
                        {buildExercisePurpose(ex)}
                      </p>
                    )}
                    {buildExerciseSafetyGuidance(ex) && (
                      <p className="text-amber-300/80 text-[10px] mt-1 line-clamp-2">
                        Cuidado: {buildExerciseSafetyGuidance(ex)}
                      </p>
                    )}
                    {ex.sequenceImageUrl && (
                      <p className="text-blue-300/80 text-[10px] mt-1 line-clamp-1">
                        Sequência visual disponível
                      </p>
                    )}
                  </button>
                ))}
                {filteredLibrary.length === 0 && (
                  <p className="text-[#525252] text-sm col-span-full text-center py-4">Nenhum exercício encontrado</p>
                )}
              </div>
            </div>
          )}

          {exercises.length === 0 ? (
            <p className="text-[#525252] text-sm text-center py-8">
              Nenhum exercício adicionado. Clique em "+ Adicionar exercício" para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {exercises.map((ex, index) => (
                <div key={index} className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#00A19C]/20 text-[#00A19C] text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{index + 1}</span>
                      <span className="text-[#f5f5f5] font-medium">{ex.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveExercise(index, "up")} disabled={index === 0} className="text-[#a1a1a1] hover:text-[#f5f5f5] disabled:opacity-30 p-1">↑</button>
                      <button type="button" onClick={() => moveExercise(index, "down")} disabled={index === exercises.length - 1} className="text-[#a1a1a1] hover:text-[#f5f5f5] disabled:opacity-30 p-1">↓</button>
                      <button type="button" onClick={() => removeExercise(index)} className="text-red-400 hover:text-red-300 p-1 ml-2">✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    {ex.sequenceImageUrl && (
                      <div className="md:col-span-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-blue-300 font-semibold">
                          Sequência visual
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
                          {ex.sequenceImageLabel || "Imagem sequencial de execução disponível para o aluno."}
                          {ex.sequenceImageNotes ? ` ${ex.sequenceImageNotes}` : ""}
                        </p>
                      </div>
                    )}
                    {getExercisePurpose(ex) && (
                      <div className="rounded-lg border border-[#ffffff10] bg-[#111] p-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#00A19C] font-semibold">
                          Pra que serve
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-[#d4d4d4]">
                          {getExercisePurpose(ex)}
                        </p>
                      </div>
                    )}

                    {getExerciseSafetyGuidance(ex) && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">
                          Cuidados de execução
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                          {getExerciseSafetyGuidance(ex)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Séries</label>
                      <input type="number" min="1" max="10" value={ex.series} onChange={(e) => updateExercise(index, "series", parseInt(e.target.value) || 3)} className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#00A19C]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Repetições</label>
                      <input type="text" value={ex.reps} onChange={(e) => updateExercise(index, "reps", e.target.value)} placeholder="Ex: 10 ou 8-12" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Carga <span className="text-[#525252]">(opc)</span></label>
                      <input type="text" value={ex.weight} onChange={(e) => updateExercise(index, "weight", e.target.value)} placeholder="Ex: 10kg" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Descanso</label>
                      <input type="text" value={ex.restTime} onChange={(e) => updateExercise(index, "restTime", e.target.value)} placeholder="Ex: 60s" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-[#a1a1a1] block mb-0.5">Observações <span className="text-[#525252]">(opcional)</span></label>
                    <input type="text" value={ex.notes} onChange={(e) => updateExercise(index, "notes", e.target.value)} placeholder="Ex: Execução lenta, 3 segundos na fase excêntrica" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#00A19C] mb-4">📝 Observações do Plano</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observações gerais para o aluno sobre este treino..." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openWorkoutPrintPreview}
            disabled={!selectedStudent || !planName.trim() || !date || exercises.length === 0 || selectedStudentMissingBirthDate}
            className="w-full bg-[#1a1a1a] border border-[#00A19C]/30 text-[#00A19C] font-bold rounded-xl py-4 text-base transition hover:bg-[#00A19C]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            👁️ Pré-visualizar treino em PDF
          </button>

        <button
          type="submit"
          disabled={
            saving ||
            !selectedStudent ||
            selectedStudentMissingBirthDate ||
            !planName.trim() ||
            !date ||
            exercises.length === 0 ||
            library.length === 0 ||
            exercises.some((exercise) => !exercise.libraryExerciseId) ||
            !weeklyWorkoutLimit ||
            (isWeeklyLimitReached && !editingWorkoutId)
          }
          className="w-full bg-[#00A19C] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#007D79] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? "💾 Salvando treino..."
            : editingWorkoutId
              ? "✅ Salvar alterações e voltar ao dashboard"
            : selectedStudentMissingBirthDate
              ? "⚠️ Data de nascimento pendente"
              : library.length === 0
              ? "⚠️ Biblioteca vazia"
              : !weeklyWorkoutLimit && selectedStudent
              ? "⚠️ Sem contrato ativo para a data"
              : exercises.some((exercise) => !exercise.libraryExerciseId)
                ? "⚠️ Exercício fora da biblioteca"
                : isWeeklyLimitReached
                ? "🚫 Limite semanal atingido"
                : willCompleteWeekOnSave
                  ? isFutureWorkoutWeek
                    ? "✅ Salvar pré-planejamento da semana futura"
                    : "✅ Salvar treino e liberar semana para o aluno"
                  : weeklyWorkoutLimit && nextWeeklyCount
                    ? isFutureWorkoutWeek
                      ? `💾 Salvar pré-planejamento ${nextWeeklyCount}/${weeklyWorkoutLimit}`
                      : `💾 Salvar treino ${nextWeeklyCount}/${weeklyWorkoutLimit} sem notificar ainda`
                    : "💾 Salvar treino"}
        </button>
        </div>
        <p className="text-xs text-[#525252] text-center">
          {exercises.length} exercício{exercises.length !== 1 ? "s" : ""}
          {selectedStudent && ` • Aluno: ${students.find((s) => s.id === selectedStudent)?.name || ""}`}
          {selectedStudentInfo?.ageYears !== null && selectedStudentInfo?.ageYears !== undefined && ` • Idade: ${selectedStudentInfo.ageYears} ano(s)`}
          {date && ` • Data: ${formatDatePtBr(new Date(`${date}T12:00:00`))}`}
          {weeklyWorkoutLimit && ` • Semana: ${weeklyPlansCount}/${weeklyWorkoutLimit}`}
          {studentSummary && " • Resumo inteligente preenchido"}
        </p>
      </form>
    </div>
  );
}
