/**
 * Oferta comercial atual: um único produto, 3 treinos por semana (ver
 * especificação Fase A, 3.1). A oferta de teste precisa ser compatível com
 * essa frequência — não qualquer ServicePlan antigo com allowTrial=true.
 */
export const TRIAL_OFFER_WORKOUTS_PER_WEEK = 3;

/**
 * Erro operacional claro quando não há oferta de teste configurada.
 * Nunca deve disparar a criação silenciosa de um plano hard-coded — ver
 * especificação Fase A / seção 15 ("Remover fallback silencioso antigo").
 */
export class TrialPlanNotConfiguredError extends Error {
  constructor() {
    super(
      "Nenhuma oferta de teste está configurada. Configure um ServicePlan com allowTrial=true e active=true antes de permitir novos cadastros."
    );
    this.name = "TrialPlanNotConfiguredError";
  }
}

/**
 * Erro operacional claro quando a única oferta de teste configurada não é
 * compatível com a oferta comercial atual (3x/semana). Nunca deve cadastrar
 * silenciosamente o aluno com dados de um plano antigo incoerente.
 */
export class TrialPlanIncompatibleError extends Error {
  constructor(plan: TrialPlanLike) {
    super(
      `A oferta de teste configurada ("${plan?.name || "sem nome"}") tem ${plan?.workoutsPerWeek ?? "?"} treino(s) por semana, mas a oferta comercial atual é de ${TRIAL_OFFER_WORKOUTS_PER_WEEK}x por semana. Configure um ServicePlan com allowTrial=true, active=true e workoutsPerWeek=${TRIAL_OFFER_WORKOUTS_PER_WEEK}, ou corrija o plano existente antes de permitir novos cadastros.`
    );
    this.name = "TrialPlanIncompatibleError";
  }
}

export type TrialPlanLike = {
  name?: string | null;
  workoutsPerWeek?: number | null;
};

export function isTrialPlanCompatibleWithCurrentOffer(
  plan: TrialPlanLike | null | undefined
): boolean {
  if (!plan) return false;
  return Number(plan.workoutsPerWeek) === TRIAL_OFFER_WORKOUTS_PER_WEEK;
}

/**
 * Único ponto de seleção/validação da oferta de teste usado no cadastro:
 * falha com erro claro tanto na ausência de oferta quanto numa oferta
 * tecnicamente "allowTrial=true, active=true" mas incompatível com a
 * frequência comercial atual (ex.: um plano antigo de 2x/semana).
 */
export function assertTrialPlanConfigured<T extends TrialPlanLike>(
  plan: T | null | undefined
): T {
  if (!plan) {
    throw new TrialPlanNotConfiguredError();
  }

  if (!isTrialPlanCompatibleWithCurrentOffer(plan)) {
    throw new TrialPlanIncompatibleError(plan);
  }

  return plan;
}
