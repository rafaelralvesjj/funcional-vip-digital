"use client";

import { ExerciseItem } from "../lib/types";

interface Props {
  exercises: ExerciseItem[];
  onChange: (items: ExerciseItem[]) => void;
}

export default function WorkoutExercisesEditor({ exercises, onChange }: Props) {
  function update(index: number, field: keyof ExerciseItem, value: string | number) {
    onChange(
      exercises.map((exercise, currentIndex) =>
        currentIndex === index ? { ...exercise, [field]: value } : exercise
      )
    );
  }

  function remove(index: number) {
    onChange(
      exercises
        .filter((_, currentIndex) => currentIndex !== index)
        .map((exercise, order) => ({ ...exercise, order }))
    );
  }

  function move(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= exercises.length) return;

    const next = [...exercises];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((exercise, order) => ({ ...exercise, order })));
  }

  if (exercises.length === 0) {
    return <p className="py-8 text-center text-sm text-[#737373]">Nenhum exercício adicionado.</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {exercises.map((exercise, index) => (
        <div
          key={`${exercise.libraryExerciseId}-${index}`}
          className="rounded-lg border border-[#ffffff10] bg-[#0a0a0a] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-[#f5f5f5]">
              {index + 1}. {exercise.name}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => move(index, "up")} disabled={index === 0} className="text-[#a1a1a1] disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(index, "down")} disabled={index === exercises.length - 1} className="text-[#a1a1a1] disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(index)} className="text-red-400">Remover</button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="number" min="1" value={exercise.series} onChange={(event) => update(index, "series", Number(event.target.value) || 1)} className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
            <input value={exercise.reps} onChange={(event) => update(index, "reps", event.target.value)} placeholder="Repetições" className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
            <input value={exercise.weight} onChange={(event) => update(index, "weight", event.target.value)} placeholder="Carga" className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
            <input value={exercise.restTime} onChange={(event) => update(index, "restTime", event.target.value)} placeholder="Descanso" className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
          </div>

          <input value={exercise.notes} onChange={(event) => update(index, "notes", event.target.value)} placeholder="Observações do exercício" className="mt-3 w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
        </div>
      ))}
    </div>
  );
}
