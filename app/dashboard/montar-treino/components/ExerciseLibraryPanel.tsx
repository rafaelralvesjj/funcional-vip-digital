"use client";

import { useMemo, useState } from "react";
import { LibraryExercise } from "../lib/types";

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
      const response = await fetch("/api/exercise-library?active=1&view=picker&limit=200", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível carregar a biblioteca.");
      }

      setExercises(
        Array.isArray(data?.exercises)
          ? data.exercises
          : Array.isArray(data)
            ? data
            : []
      );
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
    const next = !open;
    setOpen(next);
    if (next && !loaded) await loadLibrary();
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="rounded-lg bg-[#D4A373] px-4 py-2 text-sm font-semibold text-[#0a0a0a]"
      >
        {open ? "Fechar biblioteca" : "+ Adicionar exercício"}
      </button>

      {open && (
        <div className="mt-4 rounded-xl border border-[#ffffff10] bg-[#0a0a0a] p-4">
          {loading && <p className="text-sm text-[#D4A373]">Carregando biblioteca...</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          {!loading && !error && loaded && (
            <>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar exercício..."
                className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]"
              />
              <p className="mt-2 text-xs text-[#737373]">
                {filtered.length} exercício(s). Mostrando até 60.
              </p>
              <div className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3">
                {filtered.slice(0, 60).map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/exercise-library?id=${encodeURIComponent(exercise.id)}`, { cache: "no-store" });
                        const data = await response.json().catch(() => null);
                        if (!response.ok || !data?.exercise) throw new Error(data?.error || "Não foi possível carregar o exercício.");
                        onSelect(data.exercise);
                        setOpen(false);
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : "Não foi possível carregar o exercício.");
                      }
                    }}
                    className="rounded-lg border border-[#ffffff10] bg-[#111111] p-3 text-left"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">{exercise.name}</p>
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
