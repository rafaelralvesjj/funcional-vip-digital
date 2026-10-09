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

export function assertTrialPlanConfigured<T>(plan: T | null | undefined): T {
  if (!plan) {
    throw new TrialPlanNotConfiguredError();
  }
  return plan;
}
