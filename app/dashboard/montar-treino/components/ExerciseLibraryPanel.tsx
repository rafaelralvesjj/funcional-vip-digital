"use client";

import { useMemo, useState } from "react";

export interface LibraryExercise {
  id: string;
  name: string;
  description?: string | null;
  muscleGroup?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sequenceImageUrl?: string | null;
  sequenceImageLabel?: string | null;
  sequenceImageNotes?: string | null;
  sequenceFramesCount?: number | null;
  sequenceGeneratedByAi?: boolean | null;
  instructions?: string | null;
  safetyNotes?: string | null;
  commonMistakes?: string | null;
  contraindications?: string | null;
  objectiveTags?: string | null;
  restrictionTags?: string | null;
}

interface Props {
  onSelect: (exercise: LibraryExercise) => void;
}

export default function ExerciseLibraryPanel({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return exercises;

    return exercises.filter((exercise) =>
      [
        exercise.name,
        exercise.muscleGroup,
        exercise.description,
        exercise.objectiveTags,
        exercise.restrictionTags,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [exercises, search]);

  async function loadLibrary() {
    if (loaded || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exercise-library?active=1", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível carregar a biblioteca."
        );
      }

      const items = Array.isArray(data?.exercises)
        ? data.exercises
        : Array.isArray(data)
          ? data
          : [];

      setExercises(items);
      setLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar a biblioteca."
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen && !loaded) {
      await loadLibrary();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a] hover:bg-[#c49463]"
      >
        {open ? "Fechar biblioteca" : "+ Adicionar exercício"}
      </button>

      {open && (
        <div className="mt-4 rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
          {loading && (
            <p className="text-sm text-[#D4A373]">
              Carregando biblioteca de exercícios...
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={loadLibrary}
                className="mt-3 rounded-lg bg-[#D4A373] px-3 py-2 text-xs font-semibold text-[#0a0a0a]"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && loaded && (
            <>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou grupo muscular..."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5] outline-none focus:border-[#D4A373]"
              />

              <p className="mt-2 text-xs text-[#737373]">
                {filtered.length} exercício(s) encontrado(s).
                {filtered.length > 60
                  ? " Mostrando os primeiros 60; use a busca para refinar."
                  : ""}
              </p>

              <div className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3">
                {filtered.slice(0, 60).map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => {
                      onSelect(exercise);
                      setOpen(false);
                    }}
                    className="rounded-lg border border-[#ffffff10] bg-[#111111] p-3 text-left hover:border-[#D4A373]/50"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">
                      {exercise.name}
                    </p>
                    <p className="mt-1 text-xs text-[#a1a1a1]">
                      {exercise.muscleGroup || "Grupo não informado"}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
