"use client";

import { useEffect, useMemo, useState } from "react";
import ExerciseLibraryPanel, {
  LibraryExercise,
} from "./ExerciseLibraryPanel";

interface Student {
  id: string;
  name: string;
  ageYears?: number | null;
}

interface ActiveContract {
  id: string;
  type: string;
  planName?: string | null;
  startDate: string;
  endDate: string;
  workoutsPerWeek: number;
}

interface WorkoutSummary {
  id: string;
  date?: string | null;
  createdAt?: string | null;
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
  purpose?: string | null;
  instructions?: string | null;
  safetyGuidance?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function getWeekRange(referenceDate: Date) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
}

function formatPtBr(date: Date) {
  return date.toLocaleDateString("pt-BR");
}

function readUrlParams() {
  if (typeof window === "undefined") {
    return { studentId: "", date: "" };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    studentId: params.get("studentId") || "",
    date: params.get("date") || "",
  };
}

function buildPurpose(exercise: LibraryExercise) {
  return String(exercise.description || "").trim();
}

function buildSafety(exercise: LibraryExercise) {
  return [
    exercise.safetyNotes,
    exercise.commonMistakes
      ? `Evite: ${exercise.commonMistakes}.`
      : null,
    exercise.contraindications
      ? `Atenção: ${exercise.contraindications}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function WorkoutBuilderClient() {
  const initialParams = useMemo(readUrlParams, []);

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(
    initialParams.studentId
  );
  const [date, setDate] = useState(initialParams.date);
  const [planName, setPlanName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [intensity, setIntensity] = useState("");
  const [duration, setDuration] = useState("");
  const [caloriesMin, setCaloriesMin] = useState("");
  const [caloriesMax, setCaloriesMax] = useState("");
  const [studentSummary, setStudentSummary] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [contract, setContract] = useState<ActiveContract | null>(null);
  const [weeklyPlans, setWeeklyPlans] = useState<WorkoutSummary[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedStudentInfo = students.find(
    (student) => student.id === selectedStudent
  );

  const referenceDate = date ? parseDateInput(date) : new Date();
  const week = getWeekRange(referenceDate);
  const weeklyLimit = contract?.workoutsPerWeek || 0;
  const weeklyCount = weeklyPlans.length;
  const weeklyLimitReached =
    weeklyLimit > 0 && weeklyCount >= weeklyLimit;

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      setLoadingStudents(true);

      try {
        const response = await fetch("/api/students", {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "Não foi possível carregar os alunos.");
        }

        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.students)
            ? data.students
            : [];

        const normalized = raw.map((student: any) => ({
          id: String(student.id),
          name: String(student.name || "Aluno sem nome"),
          ageYears:
            student.ageYears === null || student.ageYears === undefined
              ? null
              : Number(student.ageYears),
        }));

        if (!cancelled) {
          setStudents(normalized);
        }
      } catch (cause) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar os alunos.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingStudents(false);
        }
      }
    }

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setContract(null);
      setWeeklyPlans([]);
      return;
    }

    let cancelled = false;

    async function loadWeek() {
      setLoadingWeek(true);

      try {
        const query = new URLSearchParams({
          studentId: selectedStudent,
          summary: "1",
        });

        if (date) {
          query.set("date", date);
        }

        const response = await fetch(
          `/api/workout-plan?${query.toString()}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Não foi possível consultar o contrato e os treinos da semana."
          );
        }

        if (!cancelled) {
          setContract(data?.activeContract || null);
          setWeeklyPlans(Array.isArray(data?.plans) ? data.plans : []);
        }
      } catch (cause) {
        if (!cancelled) {
          setContract(null);
          setWeeklyPlans([]);
          setMessage({
            type: "error",
            text:
              cause instanceof Error
                ? cause.message
                : "Não foi possível consultar a semana.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingWeek(false);
        }
      }
    }

    loadWeek();

    return () => {
      cancelled = true;
    };
  }, [selectedStudent, date]);

  function addExercise(exercise: LibraryExercise) {
    setExercises((current) => [
      ...current,
      {
        libraryExerciseId: exercise.id,
        name: exercise.name,
        description: String(exercise.description || ""),
        series: 3,
        reps: "10",
        weight: "",
        restTime: "60s",
        notes: "",
        order: current.length,
        imageUrl: exercise.imageUrl || null,
        videoUrl: exercise.videoUrl || null,
        purpose: buildPurpose(exercise),
        instructions:
          exercise.instructions || exercise.description || null,
        safetyGuidance: buildSafety(exercise),
        commonMistakes: exercise.commonMistakes || null,
        contraindications: exercise.contraindications || null,
      },
    ]);
  }

  function updateExercise(
    index: number,
    field: keyof ExerciseItem,
    value: string | number
  ) {
    setExercises((current) =>
      current.map((exercise, currentIndex) =>
        currentIndex === index
          ? { ...exercise, [field]: value }
          : exercise
      )
    );
  }

  function removeExercise(index: number) {
    setExercises((current) =>
      current
        .filter((_, currentIndex) => currentIndex !== index)
        .map((exercise, order) => ({ ...exercise, order }))
    );
  }

  async function saveWorkout(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!selectedStudent || !date || !planName.trim()) {
      setMessage({
        type: "error",
        text: "Selecione o aluno, informe a data e o nome do treino.",
      });
      return;
    }

    if (exercises.length === 0) {
      setMessage({
        type: "error",
        text: "Adicione pelo menos um exercício da biblioteca.",
      });
      return;
    }

    if (!contract || !weeklyLimit) {
      setMessage({
        type: "error",
        text: "O aluno não possui contrato ativo para esta data.",
      });
      return;
    }

    if (weeklyLimitReached) {
      setMessage({
        type: "error",
        text: "O limite de treinos desta semana já foi atingido.",
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/workout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          name: planName.trim(),
          description: description || null,
          date,
          objective: objective || null,
          focusAreas: focusAreas || null,
          intensity: intensity || null,
          estimatedDurationMinutes: duration ? Number(duration) : null,
          estimatedCaloriesMin: caloriesMin ? Number(caloriesMin) : null,
          estimatedCaloriesMax: caloriesMax ? Number(caloriesMax) : null,
          studentSummary: studentSummary || null,
          safetyNote: safetyNote || null,
          notes: notes || null,
          exercises: exercises.map((exercise, order) => ({
            libraryExerciseId: exercise.libraryExerciseId,
            exerciseId: exercise.libraryExerciseId,
            name: exercise.name,
            description: exercise.description,
            series: exercise.series,
            reps: exercise.reps || null,
            weight: exercise.weight || null,
            restTime: exercise.restTime || null,
            notes: exercise.notes || null,
            order,
            imageUrl: exercise.imageUrl || null,
            videoUrl: exercise.videoUrl || null,
            purpose: exercise.purpose || null,
            instructions: exercise.instructions || null,
            safetyGuidance: exercise.safetyGuidance || null,
            commonMistakes: exercise.commonMistakes || null,
            contraindications: exercise.contraindications || null,
          })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar o treino.");
      }

      setMessage({
        type: "success",
        text:
          data?.weeklyNotification?.message ||
          "Treino salvo com sucesso.",
      });

      setPlanName("");
      setDescription("");
      setObjective("");
      setFocusAreas("");
      setIntensity("");
      setDuration("");
      setCaloriesMin("");
      setCaloriesMax("");
      setStudentSummary("");
      setSafetyNote("");
      setNotes("");
      setExercises([]);

      setWeeklyPlans((current) => [
        ...current,
        {
          id:
            data?.workoutPlan?.id ||
            data?.plan?.id ||
            `saved-${Date.now()}`,
          date,
        },
      ]);
    } catch (cause) {
      setMessage({
        type: "error",
        text:
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar o treino.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[#D4A373]">
          Montagem semanal
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
          Montar treino
        </h1>
        <p className="mt-2 text-sm text-[#a1a1a1]">
          Versão modular estável para montagem manual dos treinos.
        </p>
      </div>

      {message && (
        <div
          className={
            "mb-5 rounded-lg border p-4 text-sm " +
            (message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/20 bg-red-500/10 text-red-300")
          }
        >
          {message.text}
        </div>
      )}

      <form onSubmit={saveWorkout} className="space-y-5">
        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <h2 className="text-lg font-semibold text-[#D4A373]">
            Aluno e semana
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[#e5e5e5]">
                Aluno
              </label>
              <select
                value={selectedStudent}
                onChange={(event) => setSelectedStudent(event.target.value)}
                disabled={loadingStudents || Boolean(initialParams.studentId)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
              >
                <option value="">
                  {loadingStudents
                    ? "Carregando alunos..."
                    : "Selecione um aluno"}
                </option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                    {student.ageYears !== null &&
                    student.ageYears !== undefined
                      ? ` · ${student.ageYears} ano(s)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#e5e5e5]">
                Data do treino
              </label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] [color-scheme:dark]"
              />
            </div>
          </div>

          {selectedStudent && (
            <div className="mt-4 rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-4">
              <p className="text-sm text-[#f5f5f5]">
                Aluno:{" "}
                <strong>{selectedStudentInfo?.name || "Carregando..."}</strong>
              </p>
              <p className="mt-1 text-xs text-[#a1a1a1]">
                Semana de {formatPtBr(week.start)} a {formatPtBr(week.end)}
              </p>
              <p className="mt-1 text-xs text-[#a1a1a1]">
                {loadingWeek
                  ? "Consultando contrato e treinos..."
                  : contract
                    ? `Contrato: ${
                        contract.planName || contract.type
                      } · ${weeklyCount}/${weeklyLimit} treino(s)`
                    : "Nenhum contrato ativo encontrado para esta data."}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <h2 className="text-lg font-semibold text-[#D4A373]">
            Identificação do treino
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              value={planName}
              onChange={(event) => setPlanName(event.target.value)}
              placeholder="Nome do treino"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descrição técnica"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <input
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Objetivo da sessão"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <input
              value={focusAreas}
              onChange={(event) => setFocusAreas(event.target.value)}
              placeholder="Foco do treino"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <select
              value={intensity}
              onChange={(event) => setIntensity(event.target.value)}
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            >
              <option value="">Intensidade</option>
              <option value="Leve">Leve</option>
              <option value="Moderada">Moderada</option>
              <option value="Alta">Alta</option>
            </select>
            <input
              type="number"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="Duração em minutos"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <input
              type="number"
              value={caloriesMin}
              onChange={(event) => setCaloriesMin(event.target.value)}
              placeholder="Calorias mínimas"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
            <input
              type="number"
              value={caloriesMax}
              onChange={(event) => setCaloriesMax(event.target.value)}
              placeholder="Calorias máximas"
              className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
            />
          </div>

          <textarea
            value={studentSummary}
            onChange={(event) => setStudentSummary(event.target.value)}
            placeholder="Resumo para o aluno"
            rows={3}
            className="mt-4 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
          />

          <textarea
            value={safetyNote}
            onChange={(event) => setSafetyNote(event.target.value)}
            placeholder="Observação de segurança"
            rows={2}
            className="mt-4 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
          />
        </section>

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#D4A373]">
              Exercícios
            </h2>
            <ExerciseLibraryPanel onSelect={addExercise} />
          </div>

          {exercises.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#737373]">
              Nenhum exercício adicionado.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {exercises.map((exercise, index) => (
                <div
                  key={`${exercise.libraryExerciseId}-${index}`}
                  className="rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-[#f5f5f5]">
                      {index + 1}. {exercise.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeExercise(index)}
                      className="text-sm text-red-400"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <input
                      type="number"
                      min="1"
                      value={exercise.series}
                      onChange={(event) =>
                        updateExercise(
                          index,
                          "series",
                          Number(event.target.value) || 1
                        )
                      }
                      placeholder="Séries"
                      className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
                    />
                    <input
                      value={exercise.reps}
                      onChange={(event) =>
                        updateExercise(index, "reps", event.target.value)
                      }
                      placeholder="Repetições"
                      className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
                    />
                    <input
                      value={exercise.weight}
                      onChange={(event) =>
                        updateExercise(index, "weight", event.target.value)
                      }
                      placeholder="Carga"
                      className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
                    />
                    <input
                      value={exercise.restTime}
                      onChange={(event) =>
                        updateExercise(index, "restTime", event.target.value)
                      }
                      placeholder="Descanso"
                      className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
                    />
                  </div>

                  <input
                    value={exercise.notes}
                    onChange={(event) =>
                      updateExercise(index, "notes", event.target.value)
                    }
                    placeholder="Observações do exercício"
                    className="mt-3 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observações gerais do plano"
            rows={3}
            className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
          />
        </section>

        <button
          type="submit"
          disabled={
            saving ||
            !selectedStudent ||
            !date ||
            !planName.trim() ||
            exercises.length === 0 ||
            !contract ||
            weeklyLimitReached
          }
          className="w-full rounded-xl bg-[#D4A373] py-4 text-base font-bold text-[#0a0a0a] disabled:opacity-50"
        >
          {saving
            ? "Salvando treino..."
            : weeklyLimitReached
              ? "Limite semanal atingido"
              : "Salvar treino"}
        </button>
      </form>
    </div>
  );
}
