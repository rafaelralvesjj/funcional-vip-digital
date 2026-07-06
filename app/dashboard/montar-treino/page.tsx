"use client";
import { useEffect, useState } from "react";

interface Student {
  id: string;
  name: string;
  email?: string;
  image?: string;
  contractedTrainingDaysPerMonth?: number | null;
}

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  imageUrl?: string;
}

interface WorkoutPlanSummary {
  id: string;
  date?: string | null;
  createdAt?: string | null;
}

interface ExerciseItem {
  name: string;
  description: string;
  series: number;
  reps: string;
  weight: string;
  restTime: string;
  notes: string;
  order: number;
}

interface AiWorkoutDraft {
  name?: string;
  date?: string;
  description?: string;
  notes?: string;
  exercises?: Partial<ExerciseItem>[];
}

interface AiWorkoutDraftBatch {
  source?: string;
  createdAt?: string;
  studentId: string;
  studentName?: string;
  currentIndex?: number;
  workouts: AiWorkoutDraft[];
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

function normalizeWorkoutPlans(data: any): WorkoutPlanSummary[] {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.plans)) return data.plans;
  if (Array.isArray(data?.workoutPlans)) return data.workoutPlans;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;

  return [];
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
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [weeklyPlansCount, setWeeklyPlansCount] = useState(0);
  const [weeklyInfoLoading, setWeeklyInfoLoading] = useState(false);
  const [lockStudentSelection, setLockStudentSelection] = useState(false);
  const [openedFromPendingList, setOpenedFromPendingList] = useState(false);
  const [aiDraftBatch, setAiDraftBatch] = useState<AiWorkoutDraftBatch | null>(null);
  const [aiDraftIndex, setAiDraftIndex] = useState(0);
  const [openedFromAiDraft, setOpenedFromAiDraft] = useState(false);

  function normalizeAiExercise(exercise: Partial<ExerciseItem>, index: number): ExerciseItem {
    return {
      name: String(exercise?.name || `Exercício ${index + 1}`),
      description: String(exercise?.description || ""),
      series: Number(exercise?.series || 3),
      reps: String(exercise?.reps || "10"),
      weight: String(exercise?.weight || ""),
      restTime: String(exercise?.restTime || "60s"),
      notes: String(exercise?.notes || ""),
      order: index,
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

    if (studentIdFromUrl) {
      setSelectedStudent(studentIdFromUrl);
      setLockStudentSelection(true);
      setOpenedFromPendingList(true);
    }

    if (dateFromUrl) {
      setDate(dateFromUrl);
    }
  }

  useEffect(() => {
    applyDashboardParams();
    loadAiWorkoutDraftFromStorage();
    fetchStudents();
    fetchLibrary();
  }, []);

  useEffect(() => {
    /*
     * Reaplica os parâmetros depois que a lista de alunos carrega.
     * Isso garante que o combo fique selecionado mesmo quando a tela veio
     * do dashboard antes de os alunos terminarem de carregar.
     */
    if (students.length > 0 && !openedFromAiDraft) {
      applyDashboardParams();
    }
  }, [students.length, openedFromAiDraft]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      setFilteredLibrary(
        library.filter(
          (ex) =>
            ex.name.toLowerCase().includes(term) ||
            ex.muscleGroup.toLowerCase().includes(term)
        )
      );
    } else {
      setFilteredLibrary(library);
    }
  }, [searchTerm, library]);

  const selectedStudentInfo = students.find((student) => student.id === selectedStudent);
  const weeklyWorkoutLimit = getWeeklyWorkoutLimit(
    selectedStudentInfo?.contractedTrainingDaysPerMonth
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
  const referenceWeekDate = date ? new Date(date + "T12:00:00") : new Date();
  const { startOfWeek, endOfWeek } = getWeekRange(referenceWeekDate);
  const currentWeekRange = getWeekRange(new Date());
  const isFutureWorkoutWeek =
    startOfWeek.getTime() > currentWeekRange.startOfWeek.getTime();
  const isWeeklyLimitReached =
    weeklyWorkoutLimit != null && weeklyPlansCount >= weeklyWorkoutLimit;

  useEffect(() => {
    async function fetchWeeklyWorkoutInfo() {
      if (!selectedStudent) {
        setWeeklyPlansCount(0);
        return;
      }

      setWeeklyInfoLoading(true);

      try {
        const res = await fetch(`/api/workout-plan?studentId=${selectedStudent}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setWeeklyPlansCount(0);
          return;
        }

        const data = await res.json();
        const plans = normalizeWorkoutPlans(data);
        const { startOfWeek, endOfWeek } = getWeekRange(
          date ? new Date(date + "T12:00:00") : new Date()
        );

        const countThisWeek = plans.filter((plan) => {
          const rawDate = plan.date || plan.createdAt;
          if (!rawDate) return false;

          const planDate = new Date(rawDate);

          return planDate >= startOfWeek && planDate < endOfWeek;
        }).length;

        setWeeklyPlansCount(countThisWeek);
      } catch (error) {
        console.error("Erro ao buscar treinos da semana:", error);
        setWeeklyPlansCount(0);
      } finally {
        setWeeklyInfoLoading(false);
      }
    }

    fetchWeeklyWorkoutInfo();
  }, [selectedStudent, date]);

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
            contractedTrainingDaysPerMonth:
              student.contractedTrainingDaysPerMonth ??
              student.contracted_training_days_per_month ??
              null,
          }))
        );
      }
    } catch (e) {
      console.error("Erro ao buscar alunos:", e);
    }
  }

  async function fetchLibrary() {
    try {
      const res = await fetch("/api/exercise-library");
      if (res.ok) {
        const data = await res.json();
        setLibrary(data.exercises || []);
        setFilteredLibrary(data.exercises || []);
      }
    } catch {}
  }

  function addExercise(ex: LibraryExercise) {
    const newExercise: ExerciseItem = {
      name: ex.name,
      description: ex.description,
      series: 3,
      reps: "10",
      weight: "",
      restTime: "60s",
      notes: "",
      order: exercises.length,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !planName.trim() || exercises.length === 0) return;

    if (!weeklyWorkoutLimit) {
      alert(
        "Este aluno ainda não tem quantidade contratada de treinos/dias no mês configurada. A gestão precisa preencher essa informação antes de montar o treino."
      );
      return;
    }

    if (isWeeklyLimitReached) {
      alert(
        `Este aluno já recebeu ${weeklyPlansCount} treino(s) nesta semana. O limite atual é de ${weeklyWorkoutLimit} treino(s) por semana.`
      );
      return;
    }
    setSaving(true);
    setSuccess(null);
    try {
      const res = await fetch("/api/workout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          name: planName.trim(),
          description: description || null,
          date: date || null,
          notes: notes || null,
          exercises: exercises.map((ex) => ({
            name: ex.name,
            description: ex.description,
            series: ex.series,
            reps: ex.reps || null,
            weight: ex.weight || null,
            restTime: ex.restTime || null,
            notes: ex.notes || null,
            order: ex.order,
          })),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const weeklyMessage =
          result?.weeklyNotification?.message ||
          "Treino salvo com sucesso.";

        const hasNextAiWorkout =
          openedFromAiDraft &&
          aiDraftBatch &&
          aiDraftIndex + 1 < aiDraftBatch.workouts.length;

        setSuccess(
          hasNextAiWorkout
            ? `${weeklyMessage} Próximo treino sugerido pela IA carregado para revisão.`
            : weeklyMessage
        );

        if (hasNextAiWorkout && aiDraftBatch) {
          loadAiDraftByIndex(aiDraftIndex + 1);
        } else {
          setPlanName("");
          if (!openedFromPendingList && !openedFromAiDraft) {
            setDate("");
          }
          setDescription("");
          setNotes("");
          setExercises([]);

          if (openedFromAiDraft) {
            clearAiWorkoutDraft();
          }
        }

        setWeeklyPlansCount((current) => current + 1);
        setTimeout(() => setSuccess(null), 7000);
      } else {
        const err = await res.json();
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
        <h1 className="text-2xl font-bold text-[#D4A373]">📋 Montar Treino</h1>
        <p className="text-[#a1a1a1] mt-1">
          Monte os treinos da semana. Treinos futuros ficam planejados para professor/gestão e só aparecem para o aluno na semana correta.
        </p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg p-4 mb-6">
          ✅ {success}
        </div>
      )}

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
          <h2 className="text-lg font-semibold text-[#D4A373] mb-4">👤 Aluno e Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Selecione o aluno *</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                required
                disabled={lockStudentSelection}
                className={
                  "w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] " +
                  (lockStudentSelection ? "opacity-80 cursor-not-allowed" : "")
                }
              >
                <option value="">Selecione um aluno...</option>
                {selectedStudent && !students.some((s) => s.id === selectedStudent) && (
                  <option value={selectedStudent}>Aluno selecionado pelo dashboard</option>
                )}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {(openedFromPendingList || openedFromAiDraft) && selectedStudent && (
                <div className="mt-2 rounded-lg border border-[#D4A373]/20 bg-[#D4A373]/10 p-2">
                  <p className="text-[11px] text-[#D4A373] font-medium">
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
                      setOpenedFromAiDraft(false);
                    }}
                    className="text-[10px] text-[#a1a1a1] hover:text-white underline mt-1"
                  >
                    Trocar aluno manualmente
                  </button>
                </div>
              )}
            </div>

            {selectedStudent && (
              <div className="md:col-span-2 bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#D4A373]">
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
                        (isWeeklyLimitReached
                          ? "bg-red-500/10 text-red-400"
                          : "bg-emerald-500/10 text-emerald-400")
                      }
                    >
                      {weeklyPlansCount}/{weeklyWorkoutLimit} treino(s) criados nesta semana
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
                    Este aluno contratou{" "}
                    <span className="text-[#f5f5f5] font-semibold">
                      {selectedStudentInfo?.contractedTrainingDaysPerMonth}
                    </span>{" "}
                    treino(s)/dia(s) no mês. Para esta semana, o professor deve deixar{" "}
                    <span className="text-[#f5f5f5] font-semibold">
                      {weeklyWorkoutLimit}
                    </span>{" "}
                    treino(s) pronto(s). Ainda falta(m){" "}
                    <span className="text-[#f5f5f5] font-semibold">
                      {weeklyRemaining}
                    </span>{" "}
                    treino(s).
                  </p>

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
                        ? "Semana futura já planejada. O aluno só verá estes treinos quando chegar a semana correta."
                        : "Semana já completa. O aluno já deve ter sido notificado sobre os treinos desta semana."
                      : willCompleteWeekOnSave
                        ? isFutureWorkoutWeek
                          ? "Ao salvar este treino, a meta da semana futura ficará completa. O aluno não será notificado agora e só verá o treino na semana correta."
                          : "Ao salvar este treino, a meta semanal será completa e o aluno será notificado com um único e-mail."
                        : isFutureWorkoutWeek
                          ? "Este treino futuro será salvo como planejamento. O aluno ainda não verá este treino."
                          : "Este treino será salvo, mas o aluno ainda não será notificado. O aviso será enviado somente quando todos os treinos da semana forem criados."}
                  </div>
                  </>
                ) : (
                  <p className="text-xs text-red-400 mt-3">
                    A gestão precisa vincular o aluno e preencher a quantidade contratada
                    de treinos/dias no mês antes do professor montar o treino.
                  </p>
                )}
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
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              />
            </div>
            <div>
              <label className="text-sm text-[#e5e5e5] block mb-1">Data do treino *</label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373] [color-scheme:dark]"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4A373] pointer-events-none text-lg">
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
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#D4A373]">🏋️ Exercícios</h2>
            <button
              type="button"
              onClick={() => setShowLibrary(!showLibrary)}
              className="bg-[#D4A373] text-[#0a0a0a] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#c49463] transition"
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
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373] mb-3"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {filteredLibrary.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => addExercise(ex)}
                    className="text-left bg-[#1a1a1a] border border-[#ffffff10] rounded-lg p-3 hover:border-[#D4A373]/50 transition text-sm"
                  >
                    <p className="text-[#f5f5f5] font-medium">{ex.name}</p>
                    <p className="text-[#a1a1a1] text-xs mt-0.5">{ex.muscleGroup}</p>
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
                      <span className="bg-[#D4A373]/20 text-[#D4A373] text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{index + 1}</span>
                      <span className="text-[#f5f5f5] font-medium">{ex.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveExercise(index, "up")} disabled={index === 0} className="text-[#a1a1a1] hover:text-[#f5f5f5] disabled:opacity-30 p-1">↑</button>
                      <button type="button" onClick={() => moveExercise(index, "down")} disabled={index === exercises.length - 1} className="text-[#a1a1a1] hover:text-[#f5f5f5] disabled:opacity-30 p-1">↓</button>
                      <button type="button" onClick={() => removeExercise(index)} className="text-red-400 hover:text-red-300 p-1 ml-2">✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Séries</label>
                      <input type="number" min="1" max="10" value={ex.series} onChange={(e) => updateExercise(index, "series", parseInt(e.target.value) || 3)} className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Repetições</label>
                      <input type="text" value={ex.reps} onChange={(e) => updateExercise(index, "reps", e.target.value)} placeholder="Ex: 10 ou 8-12" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Carga <span className="text-[#525252]">(opc)</span></label>
                      <input type="text" value={ex.weight} onChange={(e) => updateExercise(index, "weight", e.target.value)} placeholder="Ex: 10kg" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#a1a1a1] block mb-0.5">Descanso</label>
                      <input type="text" value={ex.restTime} onChange={(e) => updateExercise(index, "restTime", e.target.value)} placeholder="Ex: 60s" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-[#a1a1a1] block mb-0.5">Observações <span className="text-[#525252]">(opcional)</span></label>
                    <input type="text" value={ex.notes} onChange={(e) => updateExercise(index, "notes", e.target.value)} placeholder="Ex: Execução lenta, 3 segundos na fase excêntrica" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#D4A373] mb-4">📝 Observações do Plano</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observações gerais para o aluno sobre este treino..." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#D4A373]" />
        </div>

        <button
          type="submit"
          disabled={
            saving ||
            !selectedStudent ||
            !planName.trim() ||
            !date ||
            exercises.length === 0 ||
            !weeklyWorkoutLimit ||
            isWeeklyLimitReached
          }
          className="w-full bg-[#D4A373] text-[#0a0a0a] font-bold rounded-xl py-4 text-base transition hover:bg-[#b88a5e] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? "💾 Salvando treino..."
            : !weeklyWorkoutLimit && selectedStudent
              ? "⚠️ Quantidade contratada não configurada"
              : isWeeklyLimitReached
                ? "🚫 Limite semanal atingido"
                : willCompleteWeekOnSave
                  ? isFutureWorkoutWeek
                    ? "✅ Salvar e deixar semana futura planejada"
                    : "✅ Salvar treino e liberar semana para o aluno"
                  : weeklyWorkoutLimit && nextWeeklyCount
                    ? isFutureWorkoutWeek
                      ? `💾 Salvar treino futuro ${nextWeeklyCount}/${weeklyWorkoutLimit}`
                      : `💾 Salvar treino ${nextWeeklyCount}/${weeklyWorkoutLimit} sem notificar ainda`
                    : "💾 Salvar treino"}
        </button>
        <p className="text-xs text-[#525252] text-center">
          {exercises.length} exercício{exercises.length !== 1 ? "s" : ""}
          {selectedStudent && ` • Aluno: ${students.find((s) => s.id === selectedStudent)?.name || ""}`}
          {date && ` • Data: ${new Date(date).toLocaleDateString("pt-BR")}`}
          {weeklyWorkoutLimit && ` • Semana: ${weeklyPlansCount}/${weeklyWorkoutLimit}`}
        </p>
      </form>
    </div>
  );
}
