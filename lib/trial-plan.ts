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
 * Único ponto de seleção/validação da oferta de teste usado no cadastro.
 * Recebe TODOS os ServicePlan com allowTrial=true e active=true — nunca um
 * já escolhido de antemão — e decide explicitamente:
 *
 * 1. se existir algum compatível com a oferta atual (workoutsPerWeek=3),
 *    seleciona esse (o de maior prioridade na ordem recebida, tipicamente
 *    sortOrder/createdAt da consulta);
 * 2. senão, se existir pelo menos um plano de teste ativo (mas com outra
 *    frequência — ex.: um plano antigo de 2x/semana), lança
 *    TrialPlanIncompatibleError;
 * 3. senão (nenhum plano de teste ativo), lança TrialPlanNotConfiguredError.
 *
 * Um plano antigo incompatível nunca impede a seleção de um plano novo
 * compatível coexistindo na mesma lista.
 */
export function selectTrialPlan<T extends TrialPlanLike>(
  plans: T[] | null | undefined
): T {
  const candidates = plans || [];

  if (candidates.length === 0) {
    throw new TrialPlanNotConfiguredError();
  }

  const compatible = candidates.find((plan) =>
    isTrialPlanCompatibleWithCurrentOffer(plan)
  );

  if (compatible) {
    return compatible;
  }

  throw new TrialPlanIncompatibleError(candidates[0]);
}
