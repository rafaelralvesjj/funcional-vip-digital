import { getSaoPauloCivilDateInput } from "./planning-window";
import { addCivilDays, endOfCivilDayInSaoPaulo } from "./trial-window";

/**
 * Helper central de aritmética de mês civil, com clamp para o último dia
 * válido do mês de destino — nunca estoura para o mês seguinte quando o dia
 * de origem não existe nele (31/jan + 1 mês -> 28 ou 29/fev, nunca 2 ou
 * 3/mar; isso é exatamente o bug de `Date.setMonth()` puro, que "rola" os
 * dias excedentes para o mês seguinte em vez de truncar).
 *
 * Usado por lib/contract-activation.ts (addMonthsMinusOneDay,
 * extendMonthlyAccessPeriod) para toda vigência comercial de contrato —
 * nunca `Date.setMonth()` diretamente.
 *
 * Convenção de clamp: uma vez que um ciclo "bate" no último dia do mês por
 * causa do clamp (ex.: 31/jan -> 28/fev), os ciclos seguintes continuam a
 * partir desse dia clampado (28/fev -> 28/mar -> 28/abr -> ...), em vez de
 * tentar "recuperar" o dia 31 original — mesmo comportamento usado por
 * cobranças recorrentes reais (ex.: Stripe billing_cycle_anchor).
 */
function daysInCivilMonth(year: number, month1To12: number): number {
  // Dia 0 do mês seguinte = último dia deste mês. Usa UTC só para aritmética
  // de calendário pura (ano/mês/dia), sem nenhuma dependência do fuso do
  // servidor — não representa um instante real.
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * Soma `months` a uma data civil ("YYYY-MM-DD"), com clamp. Aritmética pura
 * sobre os componentes de ano/mês/dia — não envolve Date/instante/fuso, por
 * isso é correta independente do timezone do servidor (a entrada e a saída
 * já são datas civis; converter para/de um instante real em
 * America/Sao_Paulo é responsabilidade de quem chama, ver
 * addCivilMonthsAsEndOfDay abaixo).
 */
export function addCivilMonthsClamped(civilDateInput: string, months: number): string {
  const [year, month, day] = civilDateInput.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const clampedDay = Math.min(day, daysInCivilMonth(targetYear, targetMonth));

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Soma `months` a um instante real (interpretado como data civil em
 * America/Sao_Paulo) e devolve o fim do dia civil de destino
 * (23:59:59.999 -03:00) — a convenção já usada para endDate de contrato em
 * todo o código.
 */
export function addCivilMonthsAsEndOfDay(referenceDate: Date, months: number): Date {
  const civilDate = getSaoPauloCivilDateInput(referenceDate);
  const targetCivilDate = addCivilMonthsClamped(civilDate, months);
  return endOfCivilDayInSaoPaulo(targetCivilDate);
}

/**
 * addCivilMonthsAsEndOfDay seguido de "menos um dia" — a convenção de
 * duração de contrato usada em addMonthsMinusOneDay: um contrato de N meses
 * a partir de `startDate` termina no fim do dia anterior a "startDate + N
 * meses" (ex.: 1/jan + 1 mês = 1/fev, menos um dia = 31/jan — o contrato
 * cobre o mês de janeiro inteiro).
 */
export function addCivilMonthsMinusOneDayAsEndOfDay(startDate: Date, months: number): Date {
  const startCivilDate = getSaoPauloCivilDateInput(startDate);
  const targetCivilDate = addCivilMonthsClamped(startCivilDate, months);
  const endCivilDate = addCivilDays(targetCivilDate, -1);
  return endOfCivilDayInSaoPaulo(endCivilDate);
}
