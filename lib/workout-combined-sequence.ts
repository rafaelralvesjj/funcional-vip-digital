export type SequenceExercise = {
  id?: string;
  name?: string;
  notes?: string;
  restTime?: string;
  series?: number | string;
  order?: number;
  [key: string]: unknown;
};

export type CombinedSequenceGroup = {
  type: "combined" | "single";
  label?: string;
  exercises: SequenceExercise[];
};

function parseSequenceMarker(notes: unknown): { label: string; position: number } | null {
  const text = String(notes ?? "").trim();
  const match = text.match(/^(?:COMBINADO\s+)?([A-Z])\s*([1-3])\s*(?:[-—–:]|\b)/i);
  if (!match) return null;
  return { label: match[1].toUpperCase(), position: Number(match[2]) };
}

export function groupCombinedSequenceExercises(exercises: SequenceExercise[]): CombinedSequenceGroup[] {
  const sorted = [...(exercises || [])].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const groups: CombinedSequenceGroup[] = [];

  for (let index = 0; index < sorted.length;) {
    const current = sorted[index];
    const marker = parseSequenceMarker(current.notes);

    if (!marker) {
      groups.push({ type: "single", exercises: [current] });
      index += 1;
      continue;
    }

    const combined: SequenceExercise[] = [current];
    let nextIndex = index + 1;
    let expectedPosition = marker.position + 1;

    while (nextIndex < sorted.length && expectedPosition <= 3) {
      const next = sorted[nextIndex];
      const nextMarker = parseSequenceMarker(next.notes);
      if (!nextMarker || nextMarker.label !== marker.label || nextMarker.position !== expectedPosition) break;
      combined.push(next);
      expectedPosition += 1;
      nextIndex += 1;
    }

    if (combined.length >= 2) {
      groups.push({ type: "combined", label: marker.label, exercises: combined });
      index = nextIndex;
    } else {
      groups.push({ type: "single", exercises: [current] });
      index += 1;
    }
  }

  return groups;
}

function extractRestAfterCombined(exercises: SequenceExercise[]): string {
  const last = exercises[exercises.length - 1];
  const raw = String(last?.restTime ?? "").trim();
  if (!raw) return "o descanso indicado";
  return raw
    .replace(/\s*ap[oó]s\s+(?:o\s+)?combinado\s+[A-Z]/i, "")
    .replace(/\s*ap[oó]s\s+(?:a\s+)?(?:dupla|sequ[eê]ncia)\s+[A-Z]/i, "")
    .trim() || raw;
}

export function getCombinedSequenceInstruction(group: CombinedSequenceGroup): string {
  const exercises = group.exercises || [];
  const list = exercises.map((exercise, index) => `${index + 1}. ${String(exercise.name || "Exercício")}`).join(" → ");
  const rest = extractRestAfterCombined(exercises);
  const series = Number(exercises[0]?.series || 0);
  const rounds = Number.isFinite(series) && series > 0 ? `${series} voltas` : "as voltas indicadas";
  return `${list}. Faça todos em sequência, sem descanso entre os exercícios. Depois do último, descanse ${rest} e repita até completar ${rounds}.`;
}
