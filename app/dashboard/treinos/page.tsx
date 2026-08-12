"use client";

import { useEffect, useMemo, useState } from "react";
import { canValidateWorkoutCivilDate, workoutDateToCivilKey } from "@/lib/workout-validation-window";

type Exercise = {
  id?: string;
  libraryExerciseId?: string | null;
  name: string;
  description?: string | null;
  series?: number | null;
  reps?: string | null;
  weight?: string | null;
  restTime?: string | null;
  notes?: string | null;
  order?: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

type Workout = {
  id: string;
  date: string;
  status: string;
};

type Plan = {
  id: string;
  active?: boolean;
  name: string;
  description?: string | null;
  objective?: string | null;
  focusAreas?: string | null;
  intensity?: string | null;
  estimatedDurationMinutes?: number | null;
  estimatedCaloriesMin?: number | null;
  estimatedCaloriesMax?: number | null;
  studentSummary?: string | null;
  safetyNote?: string | null;
  notes?: string | null;
  date?: string | null;
  exercises: Exercise[];
  workouts: Workout[];
};

type Student = {
  id: string;
  name: string;
  email?: string | null;
  workoutPlans: Plan[];
};

type LibraryExercise = {
  id: string;
  name: string;
  description?: string | null;
  muscleGroup?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
};

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAY_NAMES = ["D", "S", "T", "Q", "Q", "S", "S"];

function normalizeStatus(status?: string) {
  return String(status || "").toUpperCase();
}

function statusLabel(status?: string) {
  const value = normalizeStatus(status);
  if (value === "CONCLUIDO") return "Concluído";
  if (value === "CONCLUIDO_PARCIALMENTE") return "Concluído parcialmente";
  if (value === "NAO_REALIZADO") return "Não realizado";
  if (value === "NAO_CONCLUIDO_COM_RELATO") return "Não concluído com relato";
  if (value === "INTERROMPIDO_CUIDADO") return "Interrompido por cuidado";
  if (value === "PRE_PLANEJADO") return "Pré-planejado";
  if (value === "PRECISA_REVISAO") return "Precisa de revisão";
  if (value === "PENDENTE") return "Pendente";
  return value ? value.replaceAll("_", " ") : "Sem status";
}

function statusClass(status?: string) {
  const value = normalizeStatus(status);
  if (value === "CONCLUIDO") return "border-green-500/30 text-green-400";
  if (value === "CONCLUIDO_PARCIALMENTE") return "border-lime-400/30 text-lime-300";
  if (value === "NAO_REALIZADO") return "border-red-500/30 text-red-400";
  if (value === "NAO_CONCLUIDO_COM_RELATO") return "border-amber-500/30 text-amber-300";
  if (value === "INTERROMPIDO_CUIDADO") return "border-rose-500/30 text-rose-300";
  if (value === "PRE_PLANEJADO") return "border-sky-500/30 text-sky-300";
  if (value === "PRECISA_REVISAO") return "border-yellow-500/30 text-yellow-300";
  return "border-[#00A19C]/30 text-[#00A19C]";
}

function isReadOnlyWorkout(status?: string) {
  return [
    "CONCLUIDO",
    "CONCLUIDO_PARCIALMENTE",
    "NAO_REALIZADO",
    "NAO_CONCLUIDO_COM_RELATO",
    "INTERROMPIDO_CUIDADO",
  ].includes(normalizeStatus(status));
}

function isStudentVisibleWorkoutStatus(status?: string | null) {
  const value = normalizeStatus(status || undefined);
  return !["PRE_PLANEJADO", "PRECISA_REVISAO", "INTERROMPIDO_CUIDADO"].includes(value);
}

function getStartOfCurrentWeek(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getStartOfNextWeek(referenceDate = new Date()) {
  const next = getStartOfCurrentWeek(referenceDate);
  next.setDate(next.getDate() + 7);
  return next;
}

function isSundayWorkoutReleaseWindowOpen(referenceDate = new Date()) {
  return referenceDate.getDay() === 0 && referenceDate.getHours() >= 15;
}

function getStudentPlanVisibilityLimit(referenceDate = new Date()) {
  const limit = getStartOfNextWeek(referenceDate);

  if (isSundayWorkoutReleaseWindowOpen(referenceDate)) {
    limit.setDate(limit.getDate() + 7);
  }

  return limit;
}

function canValidateWorkoutDate(date: Date, referenceDate = new Date()) {
  return canValidateWorkoutCivilDate(workoutDateToCivilKey(date), referenceDate);
}

function toDateKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function formatPlanDate(plan: Plan) {
  const value = plan.date || plan.workouts[0]?.date;
  return value ? new Date(value).toLocaleDateString("pt-BR") : "Sem data";
}

export default function TreinosPage() {
  const now = new Date();
  const [students, setStudents] = useState<Student[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    student: Student;
    plan: Plan;
    readOnly: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarSelectedPlan, setCalendarSelectedPlan] = useState<Plan | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [plansRes, libraryRes] = await Promise.all([
        fetch("/api/workouts/manage", { cache: "no-store" }),
        fetch("/api/exercise-library?active=all", { cache: "no-store" }),
      ]);
      const plansData = await plansRes.json();
      const libraryData = await libraryRes.json();

      if (!plansRes.ok) {
        throw new Error(plansData?.error || "Erro ao carregar treinos");
      }

      setStudents(Array.isArray(plansData?.students) ? plansData.students : []);
      const list = Array.isArray(libraryData?.exercises)
        ? libraryData.exercises
        : Array.isArray(libraryData)
          ? libraryData
          : [];
      setLibrary(list);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar treinos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setCalendarOpen(false);
    setCalendarSelectedPlan(null);
  }, [selectedStudentId]);

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const visibleWorkoutPlans = useMemo(() => {
    if (!selectedStudent) return [];
    return selectedStudent.workoutPlans.filter(
      (plan) => plan.active !== false && plan.workouts.length > 0,
    );
  }, [selectedStudent]);

  const filteredLibrary = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return library
      .filter(
        (item) =>
          !term || `${item.name} ${item.muscleGroup || ""}`.toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [library, librarySearch]);

  const libraryById = useMemo(
    () => new Map(library.map((item) => [item.id, item])),
    [library],
  );

  const libraryByName = useMemo(
    () => new Map(library.map((item) => [item.name.trim().toLowerCase(), item])),
    [library],
  );

  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirstDay = new Date(calendarYear, calendarMonth, 1).getDay();

  function openEditor(student: Student, plan: Plan, readOnly: boolean) {
    setEditing({ student, plan, readOnly });
    setDraft({ ...plan, exercises: plan.exercises.map((item) => ({ ...item })) });
  }

  function updateExercise(index: number, field: string, value: any) {
    setDraft((current: any) => ({
      ...current,
      exercises: current.exercises.map((item: any, itemIndex: number) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...draft.exercises];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, exercises: next });
  }

  async function save() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/workouts/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, workoutPlanId: draft.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar treino");
      setEditing(null);
      setDraft(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar treino");
    } finally {
      setSaving(false);
    }
  }

  function openStudentCalendar() {
    const reference = new Date();
    setCalendarMonth(reference.getMonth());
    setCalendarYear(reference.getFullYear());
    setCalendarSelectedPlan(null);
    setCalendarOpen(true);
  }

  function changeCalendarMonth(direction: -1 | 1) {
    setCalendarSelectedPlan(null);
    setCalendarMonth((currentMonth) => {
      const nextMonth = currentMonth + direction;

      if (nextMonth < 0) {
        setCalendarYear((currentYearValue) => currentYearValue - 1);
        return 11;
      }

      if (nextMonth > 11) {
        setCalendarYear((currentYearValue) => currentYearValue + 1);
        return 0;
      }

      return nextMonth;
    });
  }

  function getCalendarPlanForDay(day: number) {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate >= getStudentPlanVisibilityLimit()) return null;

    const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;

    return (
      visibleWorkoutPlans.find((plan) => {
        const status = plan.workouts[0]?.status;
        return (
          isStudentVisibleWorkoutStatus(status) &&
          toDateKey(plan.date || plan.workouts[0]?.date) === dateKey
        );
      }) || null
    );
  }

  function isCalendarToday(day: number) {
    const reference = new Date();
    return (
      day === reference.getDate() &&
      calendarMonth === reference.getMonth() &&
      calendarYear === reference.getFullYear()
    );
  }

  function getCalendarDayState(day: number) {
    const date = new Date(calendarYear, calendarMonth, day);
    date.setHours(0, 0, 0, 0);
    const plan = getCalendarPlanForDay(day);
    const status = normalizeStatus(plan?.workouts[0]?.status);
    const completed = status === "CONCLUIDO";
    const partiallyCompleted = status === "CONCLUIDO_PARCIALMENTE";
    const hidden = date >= getStudentPlanVisibilityLimit();
    const available = Boolean(plan && !completed && !partiallyCompleted && canValidateWorkoutDate(date));
    const expired = Boolean(plan && !completed && !partiallyCompleted && !canValidateWorkoutDate(date));

    return {
      plan,
      status,
      completed,
      partiallyCompleted,
      hidden,
      available,
      expired,
    };
  }

  function getExerciseLibrarySource(exercise: Exercise) {
    if (exercise.libraryExerciseId) {
      const byId = libraryById.get(exercise.libraryExerciseId);
      if (byId) return byId;
    }

    return libraryByName.get(exercise.name.trim().toLowerCase()) || null;
  }

  function getExerciseImage(exercise: Exercise) {
    const source = getExerciseLibrarySource(exercise);
    return exercise.imageUrl || source?.imageUrl || source?.sequenceImageUrl || null;
  }

  function getExerciseDescription(exercise: Exercise) {
    const source = getExerciseLibrarySource(exercise);
    return exercise.description || source?.description || null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 text-[#f5f5f5] md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-[#00A19C]">
            Controle do professor
          </p>
          <h1 className="text-2xl font-bold text-[#00A19C]">Treinos dos alunos</h1>
          <p className="mt-2 text-sm text-[#a1a1a1]">
            Visualize todos os treinos e edite manualmente os que ainda não foram concluídos.
          </p>
        </div>

        <label className="block text-sm text-[#b5b5b5]">
          Selecione o aluno
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#ffffff10] bg-[#111] px-4 py-3 text-white outline-none focus:border-[#00A19C]"
          >
            <option value="">Escolha um aluno</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
                {student.email ? ` - ${student.email}` : ""}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-[#111] p-6 text-[#a1a1a1]">Carregando...</div>
        ) : !selectedStudent ? (
          <div className="rounded-2xl border border-[#ffffff10] bg-[#111] p-6 text-[#a1a1a1]">
            Selecione um aluno para visualizar os treinos.
          </div>
        ) : (
          <section
            key={selectedStudent.id}
            className="rounded-2xl border border-[#ffffff10] bg-[#111] p-4 md:p-5"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">{selectedStudent.name}</h2>
                <p className="text-xs text-[#777]">{selectedStudent.email || "Sem e-mail"}</p>
              </div>
              <button
                type="button"
                onClick={openStudentCalendar}
                className="rounded-lg border border-[#00A19C]/40 bg-[#00A19C]/10 px-4 py-2 text-sm font-semibold text-[#52d4cf] transition hover:bg-[#00A19C]/20"
              >
                Ver calendário do aluno
              </button>
            </div>

            {visibleWorkoutPlans.length === 0 ? (
              <p className="text-sm text-[#777]">Nenhum treino ativo gerado.</p>
            ) : (
              <div className="grid gap-3">
                {visibleWorkoutPlans.map((plan) => {
                  const status = plan.workouts[0]?.status;
                  const readOnly = isReadOnlyWorkout(status);

                  return (
                    <div
                      key={plan.id}
                      className="flex flex-col gap-4 rounded-xl border border-[#ffffff10] bg-[#181818] p-4 md:flex-row md:items-center"
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{plan.name}</h3>
                          <span
                            className={`rounded-full border px-2 py-1 text-[11px] ${statusClass(status)}`}
                          >
                            {statusLabel(status)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[#888]">
                          {formatPlanDate(plan)} · {plan.exercises.length} exercício(s)
                        </p>
                      </div>
                      <button
                        onClick={() => openEditor(selectedStudent, plan, readOnly)}
                        className="rounded-lg bg-[#00A19C] px-4 py-2 font-semibold text-black"
                      >
                        {readOnly ? "Visualizar treino" : "Editar manualmente"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {calendarOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-w-4xl rounded-2xl border border-[#ffffff15] bg-[#111] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#ffffff10] p-4 md:p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#00A19C]">
                  Visão do aluno
                </p>
                <h2 className="mt-1 text-xl font-bold">Calendário de {selectedStudent.name}</h2>
                <p className="mt-1 text-xs text-[#888]">
                  Esta visualização respeita as mesmas regras de visibilidade, cores e status do calendário do aluno.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCalendarOpen(false);
                  setCalendarSelectedPlan(null);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d1d1d] text-[#aaa] hover:text-white"
                aria-label="Fechar calendário"
              >
                ×
              </button>
            </div>

            <div className="p-4 md:p-6">
              <div className="mx-auto max-w-xl rounded-2xl border border-[#ffffff10] bg-[#181818] p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => changeCalendarMonth(-1)}
                    className="rounded-lg border border-[#ffffff10] bg-[#111] px-3 py-2 text-sm text-[#aaa] hover:text-white"
                    aria-label="Mês anterior"
                  >
                    ◀
                  </button>
                  <p className="font-semibold text-[#f5f5f5]">
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </p>
                  <button
                    type="button"
                    onClick={() => changeCalendarMonth(1)}
                    className="rounded-lg border border-[#ffffff10] bg-[#111] px-3 py-2 text-sm text-[#aaa] hover:text-white"
                    aria-label="Próximo mês"
                  >
                    ▶
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_NAMES.map((weekday, index) => (
                    <div
                      key={`${weekday}-${index}`}
                      className="py-1 text-center text-[10px] font-semibold text-[#666]"
                    >
                      {weekday}
                    </div>
                  ))}

                  {Array.from({ length: calendarFirstDay }).map((_, index) => (
                    <div key={`empty-${index}`} />
                  ))}

                  {Array.from({ length: calendarDaysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const state = getCalendarDayState(day);
                    const today = isCalendarToday(day);

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (state.plan) setCalendarSelectedPlan(state.plan);
                        }}
                        disabled={!state.plan}
                        className={`aspect-square rounded-lg border text-xs transition ${
                          state.hidden
                            ? "cursor-default border-transparent text-[#444] opacity-45"
                            : today
                              ? "border-[#00A19C]/60 text-[#00A19C]"
                              : state.plan
                                ? "border-[#ffffff10] text-[#d5d5d5] hover:border-[#00A19C]/40 hover:bg-[#00A19C]/5"
                                : "border-transparent text-[#777]"
                        }`}
                      >
                        <span className="flex h-full flex-col items-center justify-center gap-1">
                          <span>{day}</span>
                          <span className="flex min-h-[6px] items-center gap-1">
                            {state.completed && (
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                            )}
                            {state.partiallyCompleted && (
                              <span className="h-2 w-2 rounded-full bg-[#A3E635]" />
                            )}
                            {state.available && (
                              <span className="h-2 w-2 rounded-full bg-[#F97316]" />
                            )}
                            {state.expired && (
                              <span className="h-2 w-2 rounded-full bg-[#EF4444]" />
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#ffffff10] pt-4 text-[10px] text-[#aaa]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Concluído
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#A3E635]" /> Concluído parcialmente
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" /> Disponível
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> Não concluído
                  </span>
                </div>

                <p className="mt-3 text-[10px] leading-relaxed text-[#666]">
                  Clique em uma data com bolinha para visualizar o treino e as imagens dos exercícios. Treinos pré-planejados de semanas futuras permanecem ocultos, como ocorre para o aluno.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {calendarSelectedPlan && selectedStudent && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-w-4xl rounded-2xl border border-[#ffffff15] bg-[#111] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-[#ffffff10] bg-[#111] p-4 md:p-5">
              <div>
                <p className="text-xs text-[#00A19C]">{selectedStudent.name}</p>
                <h2 className="mt-1 text-xl font-bold">{calendarSelectedPlan.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#888]">{formatPlanDate(calendarSelectedPlan)}</span>
                  <span
                    className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(
                      calendarSelectedPlan.workouts[0]?.status,
                    )}`}
                  >
                    {statusLabel(calendarSelectedPlan.workouts[0]?.status)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarSelectedPlan(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d1d1d] text-[#aaa] hover:text-white"
                aria-label="Fechar treino"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-4 md:p-6">
              {(calendarSelectedPlan.studentSummary ||
                calendarSelectedPlan.objective ||
                calendarSelectedPlan.focusAreas ||
                calendarSelectedPlan.intensity ||
                calendarSelectedPlan.safetyNote) && (
                <div className="rounded-xl border border-[#00A19C]/20 bg-[#00A19C]/5 p-4">
                  {calendarSelectedPlan.studentSummary && (
                    <p className="text-sm leading-relaxed text-[#e7e7e7]">
                      {calendarSelectedPlan.studentSummary}
                    </p>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {calendarSelectedPlan.objective && (
                      <div className="rounded-lg bg-[#111] p-3 sm:col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-[#666]">Objetivo</p>
                        <p className="mt-1 text-xs text-[#ddd]">{calendarSelectedPlan.objective}</p>
                      </div>
                    )}
                    {calendarSelectedPlan.focusAreas && (
                      <div className="rounded-lg bg-[#111] p-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#666]">Áreas de foco</p>
                        <p className="mt-1 text-xs text-[#ddd]">{calendarSelectedPlan.focusAreas}</p>
                      </div>
                    )}
                    {calendarSelectedPlan.intensity && (
                      <div className="rounded-lg bg-[#111] p-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#666]">Intensidade</p>
                        <p className="mt-1 text-xs text-[#ddd]">{calendarSelectedPlan.intensity}</p>
                      </div>
                    )}
                    {calendarSelectedPlan.safetyNote && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 sm:col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-amber-300">Segurança</p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                          {calendarSelectedPlan.safetyNote}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-3 font-semibold">Exercícios do dia</h3>
                <div className="grid gap-3">
                  {calendarSelectedPlan.exercises.map((exercise, index) => {
                    const imageUrl = getExerciseImage(exercise);
                    const description = getExerciseDescription(exercise);

                    return (
                      <article
                        key={`${exercise.id || exercise.libraryExerciseId || exercise.name}-${index}`}
                        className="overflow-hidden rounded-xl border border-[#ffffff10] bg-[#181818]"
                      >
                        <div className="flex flex-col sm:flex-row">
                          <div className="flex h-48 w-full shrink-0 items-center justify-center bg-[#0d0d0d] sm:h-auto sm:min-h-[160px] sm:w-52">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={`Imagem do exercício ${exercise.name}`}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="px-4 text-center text-xs text-[#555]">
                                Imagem não cadastrada para este exercício
                              </div>
                            )}
                          </div>
                          <div className="flex-1 p-4">
                            <p className="text-xs font-semibold text-[#00A19C]">Exercício {index + 1}</p>
                            <h4 className="mt-1 text-base font-bold">{exercise.name}</h4>
                            {description && (
                              <p className="mt-2 text-xs leading-relaxed text-[#aaa]">{description}</p>
                            )}

                            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                              <div className="rounded-lg bg-[#111] p-2">
                                <p className="text-[9px] text-[#666]">Séries</p>
                                <p className="mt-1 text-xs text-[#eee]">{exercise.series ?? "—"}</p>
                              </div>
                              <div className="rounded-lg bg-[#111] p-2">
                                <p className="text-[9px] text-[#666]">Repetições</p>
                                <p className="mt-1 text-xs text-[#eee]">{exercise.reps || "—"}</p>
                              </div>
                              <div className="rounded-lg bg-[#111] p-2">
                                <p className="text-[9px] text-[#666]">Carga</p>
                                <p className="mt-1 text-xs text-[#eee]">{exercise.weight || "—"}</p>
                              </div>
                              <div className="rounded-lg bg-[#111] p-2">
                                <p className="text-[9px] text-[#666]">Descanso</p>
                                <p className="mt-1 text-xs text-[#eee]">{exercise.restTime || "—"}</p>
                              </div>
                            </div>

                            {exercise.notes && (
                              <div className="mt-3 rounded-lg border border-[#ffffff08] bg-[#111] p-3">
                                <p className="text-[9px] uppercase tracking-wide text-[#666]">Orientação</p>
                                <p className="mt-1 text-xs leading-relaxed text-[#ddd]">{exercise.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCalendarSelectedPlan(null)}
                  className="rounded-lg bg-[#00A19C] px-5 py-3 text-sm font-bold text-black"
                >
                  Voltar ao calendário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && draft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 md:p-6">
          <div className="mx-auto max-w-5xl space-y-5 rounded-2xl border border-[#ffffff15] bg-[#111] p-4 md:p-6">
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-xs text-[#00A19C]">{editing.student.name}</p>
                <h2 className="text-xl font-bold">
                  {editing.readOnly ? "Visualizar treino" : "Editar treino manualmente"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
                className="text-[#aaa]"
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["name", "Nome do treino"],
                ["objective", "Objetivo"],
                ["focusAreas", "Áreas de foco"],
                ["intensity", "Intensidade"],
                ["estimatedDurationMinutes", "Duração em minutos"],
                ["estimatedCaloriesMin", "Calorias mínimas"],
                ["estimatedCaloriesMax", "Calorias máximas"],
              ].map(([field, label]) => (
                <label key={field} className="text-xs text-[#aaa]">
                  {label}
                  <input
                    disabled={editing.readOnly}
                    value={draft[field] ?? ""}
                    onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </label>
              ))}
            </div>

            {[
              ["description", "Descrição"],
              ["studentSummary", "Resumo para o aluno"],
              ["safetyNote", "Orientação de segurança"],
              ["notes", "Observações do professor"],
            ].map(([field, label]) => (
              <label key={field} className="block text-xs text-[#aaa]">
                {label}
                <textarea
                  disabled={editing.readOnly}
                  value={draft[field] ?? ""}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
            ))}

            <div>
              <h3 className="mb-3 font-semibold">Exercícios</h3>
              <div className="space-y-3">
                {draft.exercises.map((exercise: any, index: number) => (
                  <div
                    key={`${exercise.id || exercise.libraryExerciseId}-${index}`}
                    className="rounded-xl border border-[#ffffff10] bg-[#181818] p-3"
                  >
                    <div className="mb-3 flex justify-between gap-2">
                      <strong>
                        {index + 1}. {exercise.name}
                      </strong>
                      {!editing.readOnly && (
                        <div className="flex gap-2">
                          <button onClick={() => move(index, -1)}>↑</button>
                          <button onClick={() => move(index, 1)}>↓</button>
                          <button
                            onClick={() =>
                              setDraft({
                                ...draft,
                                exercises: draft.exercises.filter(
                                  (_: any, exerciseIndex: number) => exerciseIndex !== index,
                                ),
                              })
                            }
                            className="text-red-400"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                      {[
                        ["series", "Séries"],
                        ["reps", "Repetições"],
                        ["weight", "Carga"],
                        ["restTime", "Descanso"],
                        ["notes", "Observação"],
                      ].map(([field, label]) => (
                        <label key={field} className="text-[11px] text-[#888]">
                          {label}
                          <input
                            disabled={editing.readOnly}
                            value={exercise[field] ?? ""}
                            onChange={(event) => updateExercise(index, field, event.target.value)}
                            className="mt-1 w-full rounded border border-[#ffffff10] bg-[#222] px-2 py-2 text-white disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!editing.readOnly && (
              <div className="rounded-xl bg-[#181818] p-3">
                <p className="mb-2 text-sm font-semibold">Adicionar exercício da biblioteca</p>
                <input
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  placeholder="Pesquisar exercício..."
                  className="mb-2 w-full rounded-lg border border-[#ffffff10] bg-[#222] px-3 py-2"
                />
                <div className="grid max-h-48 gap-2 overflow-y-auto md:grid-cols-2">
                  {filteredLibrary.map((item) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          exercises: [
                            ...draft.exercises,
                            {
                              libraryExerciseId: item.id,
                              name: item.name,
                              series: 3,
                              reps: "10",
                              weight: "",
                              restTime: "60s",
                              notes: "",
                            },
                          ],
                        })
                      }
                      className="rounded-lg border border-[#ffffff10] bg-[#222] p-2 text-left text-sm hover:border-[#00A19C]"
                    >
                      + {item.name}
                      <span className="block text-[10px] text-[#777]">{item.muscleGroup || ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
                className="rounded-lg bg-[#222] px-4 py-3"
              >
                {editing.readOnly ? "Fechar" : "Cancelar"}
              </button>
              {!editing.readOnly && (
                <button
                  disabled={saving || draft.exercises.length === 0}
                  onClick={save}
                  className="rounded-lg bg-[#00A19C] px-5 py-3 font-bold text-black disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
