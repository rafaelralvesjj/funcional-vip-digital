import {
  type AsaasClientConfig,
  type AsaasBillingType,
  type AsaasSubscription,
  type AsaasPayment,
  createAsaasPayment,
  createAsaasSubscription,
  listAsaasSubscriptionPayments,
  getAsaasPaymentById,
  findAsaasSubscriptionByExternalReference,
  findAsaasPaymentByExternalReference,
} from "./asaas-client";
import { getSaoPauloCivilDateInput } from "./planning-window";

/**
 * Estado local já conhecido de uma tentativa de checkout (nova ou em
 * retomada). Quando providerSubscriptionId/providerPaymentId já estão
 * preenchidos, é porque uma tentativa anterior já criou o recurso na Asaas
 * com sucesso — NUNCA cria um novo nesse caso, só busca o estado atual.
 */
export type PendingChargeState = {
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  externalReference: string;
};

export type ResolvedCharge = {
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  paymentLinkUrl: string | null;
  dueDate: Date | null;
};

function toInvoiceDueDate(dueDate?: string | null): Date | null {
  return dueDate ? new Date(`${dueDate}T12:00:00`) : null;
}

function subscriptionPaymentToResolvedCharge(
  subscriptionId: string,
  firstPayment: AsaasPayment | null
): ResolvedCharge {
  return {
    providerSubscriptionId: subscriptionId,
    providerPaymentId: firstPayment?.id || null,
    paymentLinkUrl: firstPayment?.invoiceUrl || null,
    dueDate: toInvoiceDueDate(firstPayment?.dueDate),
  };
}

function paymentToResolvedCharge(payment: AsaasPayment): ResolvedCharge {
  return {
    providerSubscriptionId: null,
    providerPaymentId: payment.id,
    paymentLinkUrl: payment.invoiceUrl || null,
    dueDate: toInvoiceDueDate(payment.dueDate),
  };
}

async function reconcileSubscription(config: AsaasClientConfig, subscriptionId: string): Promise<ResolvedCharge> {
  const payments = await listAsaasSubscriptionPayments(config, subscriptionId);
  return subscriptionPaymentToResolvedCharge(subscriptionId, payments[0] || null);
}

async function resolveMonthlyCharge(params: {
  config: AsaasClientConfig;
  customerId: string;
  amountValue: number;
  description: string;
  pending: PendingChargeState;
  nextDueDate: string;
  billingType: AsaasBillingType;
}): Promise<ResolvedCharge> {
  // 1. Já sabemos a assinatura (uma tentativa anterior completou esta
  // etapa) — nunca cria outra, só busca o estado atual dela.
  if (params.pending.providerSubscriptionId) {
    return reconcileSubscription(params.config, params.pending.providerSubscriptionId);
  }

  // 2. Reconciliação: pode já existir uma assinatura criada numa tentativa
  // anterior que falhou DEPOIS da criação (ex.: ao consultar a primeira
  // cobrança) e cujo id nunca chegou a ser persistido localmente. Busca por
  // externalReference antes de criar, para nunca duplicar.
  const existing = await findAsaasSubscriptionByExternalReference(params.config, params.pending.externalReference);
  if (existing) {
    return reconcileSubscription(params.config, existing.id);
  }

  // 3. De fato a primeira tentativa: cria.
  const subscription: AsaasSubscription = await createAsaasSubscription(params.config, {
    customerId: params.customerId,
    billingType: params.billingType,
    value: params.amountValue,
    nextDueDate: params.nextDueDate,
    externalReference: params.pending.externalReference,
    description: params.description,
  });

  return reconcileSubscription(params.config, subscription.id);
}

async function resolveAnnualCharge(params: {
  config: AsaasClientConfig;
  customerId: string;
  amountValue: number;
  description: string;
  pending: PendingChargeState;
  dueDate: string;
  billingType: AsaasBillingType;
}): Promise<ResolvedCharge> {
  if (params.pending.providerPaymentId) {
    const payment = await getAsaasPaymentById(params.config, params.pending.providerPaymentId);
    return paymentToResolvedCharge(payment);
  }

  const existing = await findAsaasPaymentByExternalReference(params.config, params.pending.externalReference);
  if (existing) {
    return paymentToResolvedCharge(existing);
  }

  const payment = await createAsaasPayment(params.config, {
    customerId: params.customerId,
    billingType: params.billingType,
    value: params.amountValue,
    dueDate: params.dueDate,
    externalReference: params.pending.externalReference,
    description: params.description,
  });

  return paymentToResolvedCharge(payment);
}

/**
 * Resolve a cobrança/assinatura de um checkout — nova tentativa ou retomada
 * de uma reserva pendente (ver lib/checkout-reservation.ts e a revisão do
 * PR #11, item 1: nunca apagar a âncora local depois de um possível efeito
 * remoto). Sempre tenta reconciliar com o que já existe na Asaas (por id já
 * conhecido, ou por busca em externalReference) ANTES de criar algo novo —
 * uma segunda tentativa depois de uma falha a meio do caminho nunca cria uma
 * segunda assinatura/cobrança.
 */
export async function resolveCheckoutCharge(params: {
  config: AsaasClientConfig;
  customerId: string;
  billingCycle: "MONTHLY" | "ANNUAL" | string;
  amountValue: number;
  description: string;
  pending: PendingChargeState;
}): Promise<ResolvedCharge> {
  const billingType: AsaasBillingType = "UNDEFINED";
  // Data civil de América/São_Paulo, nunca new Date().toISOString() — à noite
  // no Brasil (ex.: 22h em São Paulo = 01h UTC do dia seguinte) o corte UTC
  // adiantaria a data de vencimento em um dia.
  const today = getSaoPauloCivilDateInput(new Date());

  if (params.billingCycle === "MONTHLY") {
    return resolveMonthlyCharge({
      config: params.config,
      customerId: params.customerId,
      amountValue: params.amountValue,
      description: params.description,
      pending: params.pending,
      nextDueDate: today,
      billingType,
    });
  }

  return resolveAnnualCharge({
    config: params.config,
    customerId: params.customerId,
    amountValue: params.amountValue,
    description: params.description,
    pending: params.pending,
    dueDate: today,
    billingType,
  });
}
