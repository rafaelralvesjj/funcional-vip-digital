"use client";

import { useEffect, useState } from "react";

export interface AiWorkoutExerciseDraft {
  libraryExerciseId: string;
  name: string;
  description?: string;
  series?: number;
  reps?: string;
  weight?: string;
  restTime?: string;
  notes?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  purpose?: string | null;
  instructions?: string | null;
  safetyGuidance?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
}

export interface AiWorkoutDraftPayload {
  studentId: string;
  workout: {
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
    exercises: AiWorkoutExerciseDraft[];
  };
}

interface Props {
  selectedStudentId: string;
  selectedDate: string;
  onImport: (payload: AiWorkoutDraftPayload) => void;
}

interface StoredBatch {
  studentId?: string;
  currentIndex?: number;
  workouts?: Array<AiWorkoutDraftPayload["workout"]>;
}

function normalizeBatch(batch: StoredBatch): AiWorkoutDraftPayload | null {
  if (!batch?.studentId || !Array.isArray(batch.workouts) || batch.workouts.length === 0) {
    return null;
  }

  const index = Math.min(
    Math.max(Number(batch.currentIndex || 0), 0),
    batch.workouts.length - 1
  );

  const workout = batch.workouts[index];

  if (!workout || !Array.isArray(workout.exercises)) {
    return null;
  }

  const exercises = workout.exercises
    .map((exercise: any) => ({
      libraryExerciseId: String(
        exercise?.libraryExerciseId ||
          exercise?.exerciseId ||
          exercise?.exerciseLibraryId ||
          ""
      ),
      name: String(exercise?.name || "Exercício"),
      description: String(exercise?.description || ""),
      series: Number(exercise?.series || 3),
      reps: String(exercise?.reps || "10"),
      weight: String(exercise?.weight || ""),
      restTime: String(exercise?.restTime || "60s"),
      notes: String(exercise?.notes || ""),
      imageUrl: exercise?.imageUrl || null,
      videoUrl: exercise?.videoUrl || null,
      purpose: exercise?.purpose || null,
      instructions: exercise?.instructions || null,
      safetyGuidance: exercise?.safetyGuidance || null,
      commonMistakes: exercise?.commonMistakes || null,
      contraindications: exercise?.contraindications || null,
    }))
    .filter((exercise) => Boolean(exercise.libraryExerciseId));

  if (exercises.length === 0) {
    return null;
  }

  return {
    studentId: batch.studentId,
    workout: {
      ...workout,
      exercises,
    },
  };
}

export default function AiWorkoutDraftImporter({
  selectedStudentId,
  selectedDate,
  onImport,
}: Props) {
  const [availableDraft, setAvailableDraft] =
    useState<AiWorkoutDraftPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  function readStoredDraft() {
    setError(null);

    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem("aiWorkoutDraftBatch");

      if (!raw) {
        setAvailableDraft(null);
        return;
      }

      const parsed = JSON.parse(raw) as StoredBatch;
      const normalized = normalizeBatch(parsed);

      if (!normalized) {
        setAvailableDraft(null);
        setError(
          "O rascunho salvo não possui exercícios válidos da biblioteca."
        );
        return;
      }

      setAvailableDraft(normalized);
    } catch {
      setAvailableDraft(null);
      setError("O rascunho da IA salvo no navegador está inválido.");
    }
  }

  useEffect(() => {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;

    if (params?.get("source") === "ai-json") {
      readStoredDraft();
    }
  }, []);

  function clearDraft() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("aiWorkoutDraftBatch");
    }

    setAvailableDraft(null);
    setError(null);
  }

  return (
    <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-300">
            Montagem com apoio da IA
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[#a1a1a1]">
            Gere o resumo do aluno, obtenha o JSON e retorne para esta tela.
            O professor deve revisar toda a prescrição antes de salvar.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2">
          {selectedStudentId && selectedDate ? (
            <a
              href={`/dashboard/resumo-aluno?studentId=${encodeURIComponent(
                selectedStudentId
              )}&date=${encodeURIComponent(selectedDate)}`}
              className="inline-flex items-center justify-center rounded-lg bg-[#D4A373] px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#c49463]"
            >
              Gerar resumo para IA
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-[#D4A373]/30 px-4 py-2 text-xs font-semibold text-[#737373]"
            >
              Gerar resumo para IA
            </button>
          )}

          {!selectedStudentId && (
            <p className="text-[11px] text-amber-300">
              Selecione o aluno para liberar a geração por IA.
            </p>
          )}

          {selectedStudentId && !selectedDate && (
            <p className="text-[11px] text-amber-300">
              Escolha a data do treino para liberar a geração por IA.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={readStoredDraft}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/20"
        >
          Verificar rascunho salvo
        </button>

        {availableDraft && (
          <>
            <button
              type="button"
              onClick={() => onImport(availableDraft)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-emerald-400"
            >
              Importar rascunho para revisão
            </button>

            <button
              type="button"
              onClick={clearDraft}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
            >
              Limpar rascunho
            </button>
          </>
        )}
      </div>

      {availableDraft && (
        <div className="mt-4 rounded-lg border border-blue-500/20 bg-[#0a0a0a] p-3">
          <p className="text-sm font-semibold text-blue-200">
            Rascunho encontrado
          </p>
          <p className="mt-1 text-xs text-[#a1a1a1]">
            {availableDraft.workout.name || "Treino sem nome"} ·{" "}
            {availableDraft.workout.exercises.length} exercício(s)
          </p>
          {availableDraft.studentId !== selectedStudentId && selectedStudentId && (
            <p className="mt-2 text-xs text-amber-300">
              Atenção: o rascunho pertence a outro aluno. Ao importar, o aluno
              do rascunho será selecionado automaticamente.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-300">{error}</p>
      )}
    </section>
  );
}
