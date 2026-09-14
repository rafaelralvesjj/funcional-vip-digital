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
  if (!text) return null;

  // Formato curto: "A1 — ..." ou "COMBINADO A1 — ..."
  const direct = text.match(/^(?:COMBINADO\s+)?([A-Z])\s*([1-3])\s*(?:[-—–:]|\b)/i);
  if (direct) {
    return { label: direct[1].toUpperCase(), position: Number(direct[2]) };
  }

  // Formato salvo atualmente nos treinos:
  // "COMBINADO A — 3 VOLTAS | A1 ..." / "COMBINADO A — A2 ..."
  const declaredLabel = text.match(/\bCOMBINADO\s+([A-Z])\b/i)?.[1]?.toUpperCase();
  const embedded = text.match(/\b([A-Z])\s*([1-3])\b/i);
  if (!embedded) return null;

  const embeddedLabel = embedded[1].toUpperCase();
  if (declaredLabel && declaredLabel !== embeddedLabel) return null;

  return { label: embeddedLabel, position: Number(embedded[2]) };
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

  // Prefere mostrar só o tempo para não repetir textos como
  // "descanse DESCANSE 60s → volte ao A1".
  const time = raw.match(/\b\d+(?:\s*[-–]\s*\d+)?\s*(?:s|seg|segs|segundos?|min|minutos?)\b/i);
  if (time?.[0]) return time[0].replace(/\s+/g, "");

  return raw
    .replace(/^\s*descanse\s+/i, "")
    .replace(/\s*[→-]\s*volte\s+ao\s+[A-Z]\d?\s*$/i, "")
    .replace(/\s*ap[oó]s\s+(?:o\s+)?combinado\s+[A-Z]/i, "")
    .replace(/\s*ap[oó]s\s+(?:a\s+)?(?:dupla|sequ[eê]ncia)\s+[A-Z]/i, "")
    .trim() || raw;
}

export function getCombinedSequenceRest(group: CombinedSequenceGroup): string {
  return extractRestAfterCombined(group.exercises || []);
}

export function getCombinedSequenceInstruction(group: CombinedSequenceGroup): string {
  const exercises = group.exercises || [];
  const list = exercises.map((exercise, index) => `${index + 1}. ${String(exercise.name || "Exercício")}`).join(" → ");
  const rest = extractRestAfterCombined(exercises);
  const series = Number(exercises[0]?.series || 0);
  const rounds = Number.isFinite(series) && series > 0 ? `${series} voltas` : "as voltas indicadas";
  return `${list}. Faça todos em sequência, sem descanso entre os exercícios. Depois do último, descanse ${rest} e repita até completar ${rounds}.`;
}

export type StandaloneExerciseKind = "technical" | "finisher" | "single";

export function getStandaloneExerciseKind(notes: unknown): StandaloneExerciseKind {
  const text = String(notes ?? "").trim().toUpperCase();
  if (text.includes("FINALIZAÇÃO") || text.includes("FINALIZACAO")) return "finisher";
  if (text.includes("ISOLADO TÉCNICO") || text.includes("ISOLADO TECNICO")) return "technical";
  return "single";
}
