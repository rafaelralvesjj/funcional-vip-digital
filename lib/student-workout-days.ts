export const WORKOUT_DAY_OPTIONS = [
  { value: "MON", label: "Segunda-feira", shortLabel: "Seg", offset: 0, jsWeekday: 1 },
  { value: "TUE", label: "Terça-feira", shortLabel: "Ter", offset: 1, jsWeekday: 2 },
  { value: "WED", label: "Quarta-feira", shortLabel: "Qua", offset: 2, jsWeekday: 3 },
  { value: "THU", label: "Quinta-feira", shortLabel: "Qui", offset: 3, jsWeekday: 4 },
  { value: "FRI", label: "Sexta-feira", shortLabel: "Sex", offset: 4, jsWeekday: 5 },
  { value: "SAT", label: "Sábado", shortLabel: "Sáb", offset: 5, jsWeekday: 6 },
  { value: "SUN", label: "Domingo", shortLabel: "Dom", offset: 6, jsWeekday: 0 },
] as const;

export type WorkoutDayCode = (typeof WORKOUT_DAY_OPTIONS)[number]["value"];

const VALID_CODES = new Set<WorkoutDayCode>(
  WORKOUT_DAY_OPTIONS.map((option) => option.value)
);

const CODE_BY_OFFSET = new Map<number, WorkoutDayCode>(
  WORKOUT_DAY_OPTIONS.map((option) => [option.offset, option.value])
);

const OFFSET_BY_CODE = new Map<WorkoutDayCode, number>(
  WORKOUT_DAY_OPTIONS.map((option) => [option.value, option.offset])
);

const LABEL_BY_CODE = new Map<WorkoutDayCode, string>(
  WORKOUT_DAY_OPTIONS.map((option) => [option.value, option.label])
);

export function normalizePreferredWorkoutDays(value: unknown): WorkoutDayCode[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,|\s]+/g)
      : [];

  const normalized = rawValues
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item): item is WorkoutDayCode => VALID_CODES.has(item as WorkoutDayCode));

  return Array.from(new Set(normalized)).sort(
    (a, b) => (OFFSET_BY_CODE.get(a) ?? 99) - (OFFSET_BY_CODE.get(b) ?? 99)
  );
}

export function formatPreferredWorkoutDays(value: unknown): string {
  return normalizePreferredWorkoutDays(value)
    .map((code) => LABEL_BY_CODE.get(code) || code)
    .join(", ");
}

export function getPreferredWorkoutOffsets(value: unknown): number[] {
  return normalizePreferredWorkoutDays(value)
    .map((code) => OFFSET_BY_CODE.get(code))
    .filter((offset): offset is number => typeof offset === "number");
}


export function pickDistributedWorkoutOffsets(
  offsets: number[],
  count: number
): number[] {
  const normalizedOffsets = Array.from(
    new Set(
      offsets
        .map((offset) => Number(offset))
        .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 6)
    )
  ).sort((a, b) => a - b);
  const target = Math.min(Math.max(Number(count || 0), 0), normalizedOffsets.length);

  if (!target) return [];
  if (target >= normalizedOffsets.length) return normalizedOffsets;
  if (target === 1) return [normalizedOffsets[0]];

  const distributed = Array.from({ length: target }, (_, index) => {
    const position = Math.round(
      (index * (normalizedOffsets.length - 1)) / (target - 1)
    );
    return normalizedOffsets[position];
  });

  return Array.from(new Set(distributed)).slice(0, target);
}

function getCanonicalOffsets(weeklyLimit: number): number[] {
  if (weeklyLimit <= 1) return [0];
  if (weeklyLimit === 2) return [0, 2];
  if (weeklyLimit === 3) return [0, 2, 4];
  if (weeklyLimit === 4) return [0, 1, 3, 4];
  if (weeklyLimit === 5) return [0, 1, 2, 3, 4];
  if (weeklyLimit === 6) return [0, 1, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Resolve os dias recorrentes da semana.
 *
 * - Quando o aluno escolheu a mesma quantidade de dias do contrato, os dias
 *   são respeitados exatamente (ex.: 3/semana + SEG/QUA/SEX).
 * - Quando há mais dias marcados do que treinos, distribui os treinos ao
 *   longo dos dias escolhidos para evitar concentração desnecessária. A gestão
 *   pode reduzir a seleção para tornar a agenda exata.
 * - Quando há menos dias marcados do que o contrato exige, respeita somente
 *   os dias escolhidos. A rotina precisa ser atualizada antes de ampliar a
 *   frequência; o sistema nunca inventa um dia não autorizado pelo aluno.
 * - Sem preferência estruturada, mantém a regra histórica do sistema.
 */
export function resolveRecurringWorkoutOffsets(
  weeklyLimit?: number | null,
  preferredWorkoutDays?: unknown
): number[] {
  const limit = Math.min(Math.max(Number(weeklyLimit || 0), 0), 7);
  if (!limit) return [];

  const preferredOffsets = getPreferredWorkoutOffsets(preferredWorkoutDays);
  if (preferredOffsets.length === limit) {
    return preferredOffsets;
  }

  if (preferredOffsets.length > limit) {
    return pickDistributedWorkoutOffsets(preferredOffsets, limit);
  }

  if (preferredOffsets.length > 0) {
    return preferredOffsets;
  }

  return getCanonicalOffsets(limit);
}

export function workoutDayCodesFromOffsets(offsets: number[]): WorkoutDayCode[] {
  return offsets
    .map((offset) => CODE_BY_OFFSET.get(offset))
    .filter((code): code is WorkoutDayCode => Boolean(code));
}
