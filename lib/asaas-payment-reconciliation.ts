/**
 * Reconciliacao pontual: nunca confiar no navegador para declarar pagamento.
 * O status vem de GET /payments/{id} na propria Asaas, usando a chave
 * de producao guardada no servidor. Nenhum endpoint de criacao e chamado.
 */
export type AsaasRemotePaymentSnapshot = {
  id: string;
  status: string;
  value?: number | null;
  externalReference?: string | null;
  subscription?: string | null;
  customer?: string | null;
};

export type ExpectedAsaasPayment = {
  providerPaymentId: string;
  amountCents: number;
  externalReference?: string | null;
  providerSubscriptionId?: string | null;
  customerId?: string | null;
};

export function checkAsaasPaymentForReconciliation(
  remote: AsaasRemotePaymentSnapshot,
  expected: ExpectedAsaasPayment
): { confirmed: boolean; reason: string } {
  if (remote.id !== expected.providerPaymentId) {
    return { confirmed: false, reason: "ID da cobranca diferente." };
  }
  if (remote.status !== "CONFIRMED" && remote.status !== "RECEIVED") {
    return { confirmed: false, reason: "A Asaas ainda nao confirmou o pagamento." };
  }
  if (typeof remote.value !== "number" || !Number.isFinite(remote.value) ||
      Math.round(remote.value * 100) !== expected.amountCents) {
    return { confirmed: false, reason: "Valor da cobranca nao confere." };
  }
  if (expected.externalReference && remote.externalReference !== expected.externalReference) {
    return { confirmed: false, reason: "Referencia da cobranca nao confere." };
  }
  if (expected.providerSubscriptionId && remote.subscription !== expected.providerSubscriptionId) {
    return { confirmed: false, reason: "Assinatura da cobranca nao confere." };
  }
  if (expected.customerId && remote.customer !== expected.customerId) {
    return { confirmed: false, reason: "Cliente Asaas nao confere." };
  }
  return { confirmed: true, reason: "Confirmado pela API da Asaas." };
}
