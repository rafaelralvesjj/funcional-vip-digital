export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export function getSaoPauloCivilDateInput(referenceDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Não foi possível resolver a data civil de São Paulo.");
  }

  return `${year}-${month}-${day}`;
}

export function parseCivilDateInput(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  // Meio-dia local evita deslocamento de um dia por timezone/DST.
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getCivilWeekStartInput(value?: string | null): string | null {
  const parsed = parseCivilDateInput(value);
  if (!parsed) return null;

  const day = parsed.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  parsed.setDate(parsed.getDate() + diffToMonday);

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const date = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function getSaoPauloWeekday(referenceDate = new Date()): number {
  const today = getSaoPauloCivilDateInput(referenceDate);
  return parseCivilDateInput(today)?.getDay() ?? -1;
}

/**
 * Regra operacional: sexta-feira ainda é válida para concluir/montar a semana.
 * A janela atual só é considerada encerrada no sábado ou domingo.
 */
export function isUnsafeCurrentWeekPlanningDate(
  selectedDateInput?: string | null,
  referenceDate = new Date()
): boolean {
  const selectedWeekStart = getCivilWeekStartInput(selectedDateInput);
  if (!selectedWeekStart) return false;

  const todayInput = getSaoPauloCivilDateInput(referenceDate);
  const currentWeekStart = getCivilWeekStartInput(todayInput);
  const todayWeekday = getSaoPauloWeekday(referenceDate);
  const isWeekend = todayWeekday === 0 || todayWeekday === 6;

  return selectedWeekStart === currentWeekStart && isWeekend;
}
