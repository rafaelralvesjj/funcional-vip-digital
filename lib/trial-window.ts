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
export function addCivilDays(civilDateInput: string, days: number): string {
  const anchor = new Date(`${civilDateInput}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Exportado para lib/civil-month.ts (fim de dia civil, convenção de endDate de contrato). */
export function endOfCivilDayInSaoPaulo(civilDateInput: string): Date {
  return new Date(`${civilDateInput}T23:59:59.999${SAO_PAULO_UTC_OFFSET}`);
}

function startOfCivilDayInSaoPaulo(civilDateInput: string): Date {
  return new Date(`${civilDateInput}T00:00:00.000${SAO_PAULO_UTC_OFFSET}`);
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

export type PaidContractStartResolution = {
  /** Data/instante em que o contrato pago deve começar a valer. */
  startDate: Date;
  /**
   * true = pagamento confirmado enquanto o teste ainda era válido: os 7 dias
   * de teste são preservados integralmente (o contrato pago só começa no
   * dia civil seguinte ao fim do teste). false = pagamento confirmado depois
   * do teste já ter terminado: o contrato pago começa imediatamente, na
   * confirmação.
   */
  paidDuringTrial: boolean;
};

/**
 * Regra central e reutilizável (cadastro manual hoje, webhook Asaas amanhã)
 * para nunca encurtar o teste quando o aluno paga antes do fim dele — ver
 * especificação Fase A, 3.4. Pagar cedo não acelera nada: o contrato pago
 * fica programado para o dia seguinte ao fim do teste, e o teste continua
 * valendo normalmente até seu último dia civil. Pagar depois do teste já
 * ter acabado começa o contrato pago imediatamente, na confirmação.
 *
 * Recebe só trialEndDate (não a TrialWindow inteira) de propósito: no
 * momento da conversão/webhook, o que existe de verdade é o endDate já
 * persistido no StudentContract do teste — não uma janela recém-calculada
 * a partir de "agora".
 */
/**
 * Reconstrói uma TrialWindow a partir das datas já persistidas num
 * StudentContract TRIAL — para avaliar shouldShowContractCta/getTrialDaysRemaining
 * contra o teste real do aluno, sem recalcular uma janela nova a partir de
 * "agora" (que daria datas erradas para um teste que já começou no passado).
 */
export function trialWindowFromContractDates(params: {
  startDate: Date;
  endDate: Date;
}): TrialWindow {
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    startCivilDate: getSaoPauloCivilDateInput(params.startDate),
    endCivilDate: getSaoPauloCivilDateInput(params.endDate),
    maxWorkouts: TRIAL_MAX_WORKOUTS,
  };
}

export function resolvePaidContractStart(params: {
  trialEndDate: Date;
  paymentConfirmedAt: Date;
}): PaidContractStartResolution {
  const trialEndCivilDate = getSaoPauloCivilDateInput(params.trialEndDate);
  const paidDuringTrial =
    params.paymentConfirmedAt.getTime() <= params.trialEndDate.getTime();

  if (paidDuringTrial) {
    const nextCivilDate = addCivilDays(trialEndCivilDate, 1);
    return {
      startDate: startOfCivilDayInSaoPaulo(nextCivilDate),
      paidDuringTrial: true,
    };
  }

  return {
    startDate: new Date(params.paymentConfirmedAt),
    paidDuringTrial: false,
  };
}
