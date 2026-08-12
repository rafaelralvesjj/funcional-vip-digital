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
    // Limite padrão exclusivo: sábado 00h00. Treinos de segunda a sexta
    // preservam a regra histórica de conclusão até sexta, 23h59.
    validationEndKey: addDaysToCivilKey(startKey, 5),
    nextWeekStartKey: addDaysToCivilKey(startKey, 7),
  };
}

/**
 * Prazo do treino dentro da própria semana.
 * - treino de segunda a sexta: sexta-feira;
 * - treino de sábado: sábado;
 * - treino de domingo: domingo.
 *
 * Assim preservamos a regra anterior para os treinos de dias úteis e abrimos
 * o fim de semana somente quando o próprio treino foi programado para ele.
 */
export function getWorkoutValidationDeadlineCivilKey(workoutCivilKey: string): string {
  if (!parseCivilKey(workoutCivilKey)) return workoutCivilKey;

  const startKey = getWeekStartCivilKey(workoutCivilKey);
  const workoutWeekday = getCivilWeekday(workoutCivilKey);

  if (workoutWeekday === 6) return addDaysToCivilKey(startKey, 5);
  if (workoutWeekday === 0) return addDaysToCivilKey(startKey, 6);
  return addDaysToCivilKey(startKey, 4);
}

export function canValidateWorkoutCivilDate(
  workoutCivilKey: string,
  referenceDate = new Date()
): boolean {
  if (!parseCivilKey(workoutCivilKey)) return false;

  const todayKey = getSaoPauloCivilKey(referenceDate);
  const { startKey, nextWeekStartKey } = getCurrentWorkoutWeekCivilRange(referenceDate);
  const workoutWeekStart = getWeekStartCivilKey(workoutCivilKey);

  if (workoutWeekStart !== startKey) return false;

  const deadlineKey = getWorkoutValidationDeadlineCivilKey(workoutCivilKey);

  return (
    todayKey >= startKey &&
    todayKey < nextWeekStartKey &&
    todayKey <= deadlineKey
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
 *
 * - segunda a sexta: semanas anteriores já expiraram, semana atual segue aberta;
 * - sábado: treinos de segunda a sexta da semana atual expiram, mas sábado e
 *   domingo continuam preservados;
 * - domingo: sábado também expira e somente o treino de domingo segue aberto;
 * - segunda seguinte: toda a semana anterior já expirou.
 */
export function getWorkoutExpirationBoundaryCivilKey(referenceDate = new Date()): string {
  const todayKey = getSaoPauloCivilKey(referenceDate);
  const weekday = getCivilWeekday(todayKey);
  const { startKey } = getCurrentWorkoutWeekCivilRange(referenceDate);

  if (weekday === 6) return addDaysToCivilKey(startKey, 5);
  if (weekday === 0) return addDaysToCivilKey(startKey, 6);
  return startKey;
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
