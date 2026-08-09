export const WORKOUT_BUSINESS_TIME_ZONE = "America/Sao_Paulo";

export type WorkoutValidationState = "AVAILABLE" | "FUTURE" | "EXPIRED";

type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseCivilKey(value: string): CivilDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const test = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() !== month - 1 ||
    test.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatCivilParts(parts: CivilDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addDaysToCivilKey(value: string, days: number): string {
  const parts = parseCivilKey(value);
  if (!parts) return value;

  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() + days);

  return formatCivilParts({
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  });
}

export function getSaoPauloCivilKey(referenceDate = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKOUT_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(referenceDate);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function getCivilWeekday(value: string): number {
  const parts = parseCivilKey(value);
  if (!parts) return -1;

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0)).getUTCDay();
}

export function getWeekStartCivilKey(value: string): string {
  const weekday = getCivilWeekday(value);
  if (weekday < 0) return value;

  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToCivilKey(value, diffToMonday);
}

export function getCurrentWorkoutWeekCivilRange(referenceDate = new Date()): {
  startKey: string;
  validationEndKey: string;
  nextWeekStartKey: string;
} {
  const todayKey = getSaoPauloCivilKey(referenceDate);
  const startKey = getWeekStartCivilKey(todayKey);

  return {
    startKey,
    // Limite exclusivo: sábado 00h00. Segunda a sexta podem concluir.
    validationEndKey: addDaysToCivilKey(startKey, 5),
    nextWeekStartKey: addDaysToCivilKey(startKey, 7),
  };
}

export function canValidateWorkoutCivilDate(
  workoutCivilKey: string,
  referenceDate = new Date()
): boolean {
  if (!parseCivilKey(workoutCivilKey)) return false;

  const todayKey = getSaoPauloCivilKey(referenceDate);
  const todayWeekday = getCivilWeekday(todayKey);
  const { startKey, validationEndKey } = getCurrentWorkoutWeekCivilRange(referenceDate);

  return (
    todayWeekday >= 1 &&
    todayWeekday <= 5 &&
    workoutCivilKey >= startKey &&
    workoutCivilKey < validationEndKey
  );
}

export function isFutureWorkoutCivilDate(
  workoutCivilKey: string,
  referenceDate = new Date()
): boolean {
  if (!parseCivilKey(workoutCivilKey)) return false;
  const { nextWeekStartKey } = getCurrentWorkoutWeekCivilRange(referenceDate);
  return workoutCivilKey >= nextWeekStartKey;
}

export function getWorkoutValidationState(
  workoutCivilKey: string,
  referenceDate = new Date()
): WorkoutValidationState {
  if (canValidateWorkoutCivilDate(workoutCivilKey, referenceDate)) return "AVAILABLE";
  if (isFutureWorkoutCivilDate(workoutCivilKey, referenceDate)) return "FUTURE";
  return "EXPIRED";
}

/**
 * Primeiro dia que NÃO pode ser encerrado automaticamente como não realizado.
 * Segunda a sexta: início da semana atual.
 * Sábado e domingo: início da próxima semana.
 */
export function getWorkoutExpirationBoundaryCivilKey(referenceDate = new Date()): string {
  const todayKey = getSaoPauloCivilKey(referenceDate);
  const weekday = getCivilWeekday(todayKey);
  const { startKey, nextWeekStartKey } = getCurrentWorkoutWeekCivilRange(referenceDate);

  return weekday === 0 || weekday === 6 ? nextWeekStartKey : startKey;
}

/**
 * Converte a data civil do treino para um marcador UTC de início do dia.
 * Os campos `Workout.date`/`WorkoutPlan.date` representam dia de calendário,
 * não um instante horário. Portanto a comparação no banco deve usar UTC 00:00
 * da própria data civil, sem deslocar para 03:00 por causa de Brasília.
 */
export function civilKeyToUtcDate(value: string): Date {
  const parts = parseCivilKey(value);
  if (!parts) return new Date(NaN);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
}

/**
 * Recupera a data civil de um Date armazenado como marcador de calendário.
 * Usa os componentes UTC para não transformar 2026-08-10T00:00Z em 09/08
 * quando o servidor/cliente estiver em America/Sao_Paulo.
 */
export function workoutDateToCivilKey(value: Date | string | null | undefined): string {
  if (!value) return "";

  if (typeof value === "string") {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct && parseCivilKey(direct[1])) return direct[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getCurrentValidationDeadlineCivilKey(referenceDate = new Date()): string {
  const { startKey } = getCurrentWorkoutWeekCivilRange(referenceDate);
  return addDaysToCivilKey(startKey, 4);
}

export function formatCivilKeyPtBr(value: string): string {
  const parts = parseCivilKey(value);
  if (!parts) return value;
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}
