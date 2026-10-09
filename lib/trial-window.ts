import { getSaoPauloCivilDateInput, parseCivilDateInput } from "./planning-window";

/**
 * Janela de teste: 7 dias civis a partir do cadastro, nunca adiada para
 * "encaixar" a semana de calendário (ver spec Fase A, 3.2).
 */
export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_MAX_WORKOUTS = 3;
export const TRIAL_CTA_DAYS_BEFORE_END = 2;

export type TrialWindow = {
  startDate: Date;
  endDate: Date;
  startCivilDate: string;
  endCivilDate: string;
  maxWorkouts: number;
};

function civilDateToUtcMidnightMs(civilDateInput: string): number {
  return new Date(`${civilDateInput}T00:00:00Z`).getTime();
}

function diffCivilDays(fromCivilDate: string, toCivilDate: string): number {
  return Math.round(
    (civilDateToUtcMidnightMs(toCivilDate) - civilDateToUtcMidnightMs(fromCivilDate)) /
      86400000
  );
}

/**
 * Início do teste = data civil de América/São_Paulo do cadastro, sempre.
 * Nunca empurra para a próxima segunda-feira ou qualquer outro dia: a
 * programação dentro da semana se ajusta aos dias preferidos do aluno, mas
 * o início do teste em si não muda por causa disso.
 */
export function getTrialWindow(referenceDate: Date = new Date()): TrialWindow {
  const startCivilDate = getSaoPauloCivilDateInput(referenceDate);
  const startDate = parseCivilDateInput(startCivilDate);
  if (!startDate) {
    throw new Error("Não foi possível resolver a data civil de início do teste.");
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (TRIAL_DURATION_DAYS - 1));
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate,
    endDate,
    startCivilDate,
    endCivilDate: getSaoPauloCivilDateInput(endDate),
    maxWorkouts: TRIAL_MAX_WORKOUTS,
  };
}

/** Dias restantes até o fim do teste, nunca negativo (0 quando já expirou). */
export function getTrialDaysRemaining(window: TrialWindow, now: Date = new Date()): number {
  const nowCivilDate = getSaoPauloCivilDateInput(now);
  return Math.max(0, diffCivilDays(nowCivilDate, window.endCivilDate));
}

export function isTrialWindowExpired(window: TrialWindow, now: Date = new Date()): boolean {
  const nowCivilDate = getSaoPauloCivilDateInput(now);
  return diffCivilDays(nowCivilDate, window.endCivilDate) < 0;
}

/**
 * Limite é sobre o total de treinos na janela de 7 dias, não por semana —
 * virada de semana (ex.: teste atravessa domingo/segunda) não libera treino
 * extra.
 */
export function isTrialWorkoutCapReached(
  workoutsUsedInWindow: number,
  maxWorkouts: number = TRIAL_MAX_WORKOUTS
): boolean {
  return workoutsUsedInWindow >= maxWorkouts;
}

/**
 * CTA "Contratar plano": aparece a partir de T-2 dias do fim do teste e
 * continua visível após a expiração enquanto não existir contrato pago
 * ativo ou agendado.
 */
export function shouldShowContractCta(params: {
  window: TrialWindow;
  now?: Date;
  hasPaidContractActiveOrScheduled: boolean;
}): boolean {
  if (params.hasPaidContractActiveOrScheduled) return false;
  const daysRemaining = getTrialDaysRemaining(params.window, params.now ?? new Date());
  return daysRemaining <= TRIAL_CTA_DAYS_BEFORE_END;
}
