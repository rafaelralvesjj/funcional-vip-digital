export type BillingCycle = "MONTHLY" | "ANNUAL";

export type ServicePlanBillingOptionLike = {
  id?: string;
  billingCycle: BillingCycle | string;
  amountCents: number;
  active: boolean;
  recommended: boolean;
};

export function getActiveBillingOptions<T extends ServicePlanBillingOptionLike>(
  options: T[] | null | undefined
): T[] {
  return (options || []).filter((option) => option.active);
}

export function getRecommendedBillingOption<T extends ServicePlanBillingOptionLike>(
  options: T[] | null | undefined
): T | null {
  const active = getActiveBillingOptions(options);
  if (active.length === 0) return null;

  return (
    active.find((option) => option.recommended) ||
    active.find((option) => option.billingCycle === "ANNUAL") ||
    active[0]
  );
}

export function formatCentsToBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBillingOptionLabel(option: ServicePlanBillingOptionLike): string {
  const price = formatCentsToBRL(option.amountCents);
  const suffix = option.billingCycle === "ANNUAL" ? "ano" : "mês";
  return `R$ ${price}/${suffix}`;
}

/**
 * Espelha em código a unique constraint (servicePlanId, billingCycle) do
 * banco, para dar um erro de validação claro antes de depender do erro do
 * Postgres. Options já deve estar filtrado para um único ServicePlan.
 */
export function hasDuplicateBillingCycle(
  options: ServicePlanBillingOptionLike[] | null | undefined
): boolean {
  const cycles = (options || []).map((option) => option.billingCycle);
  return new Set(cycles).size !== cycles.length;
}

export function assertNoDuplicateBillingCycle(
  options: ServicePlanBillingOptionLike[] | null | undefined
): void {
  if (hasDuplicateBillingCycle(options)) {
    throw new Error(
      "Um plano não pode ter duas opções de cobrança com o mesmo billingCycle."
    );
  }
}

/**
 * Garantia de camada de serviço (não existe constraint de banco equivalente):
 * no máximo uma opção ativa recomendada por plano. Options já deve estar
 * filtrado para um único ServicePlan.
 */
export function hasAtMostOneRecommendedActiveOption(
  options: ServicePlanBillingOptionLike[] | null | undefined
): boolean {
  const recommendedActive = getActiveBillingOptions(options).filter(
    (option) => option.recommended
  );
  return recommendedActive.length <= 1;
}

export function assertAtMostOneRecommendedActiveOption(
  options: ServicePlanBillingOptionLike[] | null | undefined
): void {
  if (!hasAtMostOneRecommendedActiveOption(options)) {
    throw new Error(
      "Só pode existir uma opção de cobrança recomendada ativa por plano."
    );
  }
}

/**
 * Helper para quem for marcar uma opção como recomendada: devolve o mesmo
 * conjunto com recommended=true só no id escolhido, garantindo exclusividade
 * antes de persistir (dentro de uma transação, no código que vier a usar
 * isso nas próximas fases).
 */
export function withExclusiveRecommendedOption<
  T extends ServicePlanBillingOptionLike & { id: string }
>(options: T[], recommendedId: string): T[] {
  return options.map((option) => ({
    ...option,
    recommended: option.id === recommendedId,
  }));
}
