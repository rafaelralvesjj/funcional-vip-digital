import { getSaoPauloCivilDateInput } from "./planning-window";

/**
 * Janela de teste: 7 dias civis a partir do cadastro, nunca adiada para
 * "encaixar" a semana de calendário (ver spec Fase A, 3.2).
 */
export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_MAX_WORKOUTS = 3;
export const TRIAL_CTA_DAYS_BEFORE_END = 2;

// America/Sao_Paulo não observa horário de verão desde 2019: offset fixo
// -03:00 o ano inteiro. Usar o offset explícito (em vez de Intl) deixa o
// cálculo do instante de fim do dia independente do fuso do servidor.
const SAO_PAULO_UTC_OFFSET = "-03:00";

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

/** Aritmética pura sobre a string de data civil, sem instante/fuso envolvido. */
function addCivilDays(civilDateInput: string, days: number): string {
  const anchor = new Date(`${civilDateInput}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function endOfCivilDayInSaoPaulo(civilDateInput: string): Date {
  return new Date(`${civilDateInput}T23:59:59.999${SAO_PAULO_UTC_OFFSET}`);
}

/**
 * Início do teste = instante real do cadastro (não meio-dia, não a data
 * civil truncada). Nunca empurra para a próxima segunda-feira ou qualquer
 * outro dia: a programação dentro da semana se ajusta aos dias preferidos
 * do aluno, mas o início do teste em si não muda por causa disso.
 */
export function getTrialWindow(referenceDate: Date = new Date()): TrialWindow {
  const startDate = new Date(referenceDate);
  const startCivilDate = getSaoPauloCivilDateInput(startDate);
  const endCivilDate = addCivilDays(startCivilDate, TRIAL_DURATION_DAYS - 1);
  const endDate = endOfCivilDayInSaoPaulo(endCivilDate);

  return {
    startDate,
    endDate,
    startCivilDate,
    endCivilDate,
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

/**
 * Frase canônica para qualquer aviso/e-mail sobre o teste: sempre o limite
 * real (TRIAL_MAX_WORKOUTS), nunca workoutsPerMonth do ServicePlan. Única
 * fonte da mensagem para não deixar um dos textos (Notice, e-mail do aluno,
 * e-mail da gestão) dessincronizar dos demais.
 */
export function formatTrialPeriodSummary(
  endDateText: string,
  maxWorkouts: number = TRIAL_MAX_WORKOUTS
): string {
  return `Seu período de teste vai até ${endDateText} e inclui até ${maxWorkouts} treino(s).`;
}
