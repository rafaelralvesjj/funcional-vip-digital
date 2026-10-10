/**
 * Fonte compartilhada da oferta comercial atual (produto único: 3 treinos
 * por semana, 7 dias de teste, mensal R$9,90 / anual R$99,90 recomendado) —
 * consumida tanto por scripts/setup-trial-offer.ts (semeia o ServicePlan +
 * ServicePlanBillingOption no banco) quanto pela landing pública
 * (app/page.tsx, só texto de marketing). Nenhum dos dois lados pode ter seu
 * próprio número hardcoded: mudar o preço/frequência da oferta é editar
 * este arquivo uma vez.
 *
 * Isto nunca é a fonte de verdade em runtime do checkout — o fluxo de
 * contratação (app/api/aluno/checkout/route.ts, app/aluno/contratar)
 * sempre lê o ServicePlanBillingOption real do banco. Este arquivo só
 * mantém o script de setup e o texto da landing sincronizados com o número
 * que, de fato, é usado para semear esse registro.
 */
import { TRIAL_OFFER_WORKOUTS_PER_WEEK } from "./trial-plan";
import { TRIAL_DURATION_DAYS } from "./trial-window";
import { formatCentsToBRL } from "./service-plan-billing";

export const COMMERCIAL_OFFER_NAME = "Funcional UP — 3 treinos por semana";
export const COMMERCIAL_OFFER_WORKOUTS_PER_WEEK = TRIAL_OFFER_WORKOUTS_PER_WEEK;
export const COMMERCIAL_OFFER_TRIAL_DAYS = TRIAL_DURATION_DAYS;

export const COMMERCIAL_OFFER_MONTHLY_PRICE_CENTS = 990;
export const COMMERCIAL_OFFER_ANNUAL_PRICE_CENTS = 9990;
export const COMMERCIAL_OFFER_ANNUAL_RECOMMENDED = true;

export function formatCommercialOfferMonthlyPrice(): string {
  return formatCentsToBRL(COMMERCIAL_OFFER_MONTHLY_PRICE_CENTS);
}

export function formatCommercialOfferAnnualPrice(): string {
  return formatCentsToBRL(COMMERCIAL_OFFER_ANNUAL_PRICE_CENTS);
}
