/**
 * Elegibilidade de um ServicePlan para contratação/conversão paga. Não é
 * mais "qualquer plano ativo" nem "qualquer plano com allowTrial=false":
 *
 * 1. Modelo novo: ServicePlan ativo com pelo menos uma ServicePlanBillingOption
 *    ativa — vale mesmo com allowTrial=true, já que o mesmo plano atende
 *    teste e contratação.
 * 2. Compatibilidade legada: ServicePlan antigo ativo, sem nenhuma
 *    BillingOption (pré-existe à Fase 1), que já era usado para venda —
 *    sinalizado por allowTrial=false (único jeito, no modelo antigo, de um
 *    plano ser "só pago": planos de teste antigos sempre tinham
 *    allowTrial=true).
 * 3. Um plano antigo só de teste (active=true, allowTrial=true, sem nenhuma
 *    BillingOption) nunca aparece como opção paga.
 */
export type ServicePlanEligibilityInput = {
  active: boolean;
  allowTrial: boolean;
};

export type ServicePlanBillingOptionEligibilityInput = {
  active: boolean;
};

export function hasActiveBillingOption(
  billingOptions: ServicePlanBillingOptionEligibilityInput[] | null | undefined
): boolean {
  return (billingOptions || []).some((option) => option.active);
}

export function isServicePlanEligibleForPaidContracting(
  plan: ServicePlanEligibilityInput,
  billingOptions?: ServicePlanBillingOptionEligibilityInput[] | null
): boolean {
  if (!plan.active) return false;
  if (hasActiveBillingOption(billingOptions)) return true;
  return !plan.allowTrial;
}

export function filterServicePlansEligibleForPaidContracting<
  T extends ServicePlanEligibilityInput & {
    billingOptions?: ServicePlanBillingOptionEligibilityInput[] | null;
  }
>(plans: T[] | null | undefined): T[] {
  return (plans || []).filter((plan) =>
    isServicePlanEligibleForPaidContracting(plan, plan.billingOptions)
  );
}
