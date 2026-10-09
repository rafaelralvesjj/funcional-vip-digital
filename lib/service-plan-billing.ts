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
