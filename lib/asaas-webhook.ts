/**
 * Verificação e normalização de webhooks da Asaas. Nenhuma lógica de banco
 * aqui — isso é consumido por app/api/webhooks/asaas/route.ts, que decide o
 * que fazer com o evento normalizado dentro de uma transação idempotente
 * (ver lib/contract-activation.ts).
 *
 * Verificação: a Asaas reenvia, no header "asaas-access-token", o token que
 * nós mesmos configuramos ao cadastrar a URL do webhook no painel da Asaas
 * — não é um segredo gerado pela Asaas, é escolhido por nós e guardado em
 * ASAAS_WEBHOOK_TOKEN. Sem essa variável configurada, todo webhook é
 * rejeitado (nunca aceito "por padrão").
 */

export class AsaasWebhookConfigError extends Error {}

export type AsaasWebhookPaymentStatus =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "DELETED"
  | string;

export type AsaasWebhookPayload = {
  event: string;
  payment?: {
    id: string;
    status: AsaasWebhookPaymentStatus;
    externalReference?: string | null;
    subscription?: string | null;
    value?: number;
    customer?: string;
  };
};

export type NormalizedAsaasWebhookEvent = {
  /** Chave de idempotência: (provider, eventId) é única em WebhookEvent. */
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  externalReference: string | null;
  /** true = este evento deve confirmar o pagamento (ativar o contrato). */
  isPaymentConfirmation: boolean;
  /** true = este evento indica atraso (sem ativar nada, só sinalizar). */
  isOverdue: boolean;
};

/**
 * PAYMENT_CONFIRMED (cartão/boleto compensado) e PAYMENT_RECEIVED (Pix/saldo
 * já creditado) são os dois eventos da Asaas que significam "dinheiro
 * confirmado" — é isso, e só isso, que pode disparar a ativação do
 * contrato. Qualquer outro evento (criação, atualização, exclusão,
 * reembolso) nunca ativa nada.
 */
const PAYMENT_CONFIRMATION_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const PAYMENT_OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

export function verifyAsaasWebhookToken(headerValue: string | null | undefined): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!expected) {
    throw new AsaasWebhookConfigError(
      "ASAAS_WEBHOOK_TOKEN não configurado. Nenhum webhook pode ser aceito sem essa variável."
    );
  }

  return Boolean(headerValue) && headerValue === expected;
}

export function normalizeAsaasWebhookEvent(payload: AsaasWebhookPayload): NormalizedAsaasWebhookEvent {
  const eventType = String(payload?.event || "").trim().toUpperCase();
  const paymentId = payload?.payment?.id || null;

  // Chave composta (não só o payment.id): a mesma cobrança pode gerar vários
  // eventos distintos (ex.: PAYMENT_CREATED, depois PAYMENT_CONFIRMED) — cada
  // um precisa de sua própria entrada de idempotência.
  const eventId = paymentId ? `${eventType}:${paymentId}` : `${eventType}:sem-payment-id:${Date.now()}`;

  return {
    eventId,
    eventType,
    providerPaymentId: paymentId,
    externalReference: payload?.payment?.externalReference || null,
    isPaymentConfirmation: PAYMENT_CONFIRMATION_EVENTS.has(eventType),
    isOverdue: PAYMENT_OVERDUE_EVENTS.has(eventType),
  };
}
