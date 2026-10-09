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
  /**
   * ID oficial do evento de webhook, gerado pela própria Asaas — único por
   * entrega. É a chave de idempotência real (ver normalizeAsaasWebhookEvent);
   * nunca inventamos uma quando ele vem preenchido.
   */
  id?: string;
  event: string;
  payment?: {
    id: string;
    status: AsaasWebhookPaymentStatus;
    externalReference?: string | null;
    /** ID da assinatura Asaas quando esta cobrança veio de um ciclo recorrente. */
    subscription?: string | null;
    value?: number;
    dueDate?: string | null;
    customer?: string;
  };
};

export type NormalizedAsaasWebhookEvent = {
  /** Chave de idempotência: (provider, eventId) é única em WebhookEvent. */
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  externalReference: string | null;
  value: number | null;
  dueDate: string | null;
  /** true = este evento deve confirmar o pagamento (ativar/renovar o contrato). */
  isPaymentConfirmation: boolean;
  /** true = este evento indica atraso (sem ativar nada, só sinalizar). */
  isOverdue: boolean;
};

/**
 * PAYMENT_CONFIRMED (cartão/boleto compensado) e PAYMENT_RECEIVED (Pix/saldo
 * já creditado) são os dois eventos da Asaas que significam "dinheiro
 * confirmado" — é isso, e só isso, que pode disparar a ativação/renovação do
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

  // A Asaas já manda um `id` único por entrega de webhook — é isso que usamos
  // como chave de idempotência, nunca algo inventado por nós (nem
  // `${eventType}:${paymentId}`, que colidiria entre reentregas legítimas do
  // MESMO evento vs. duas cobranças diferentes de uma assinatura recorrente
  // cujo paymentId muda a cada mês; nem Date.now(), que nunca deduplicaria
  // nada). O fallback composto só existe para não quebrar com um payload
  // malformado/de teste sem `id` — não deve acontecer com a Asaas real.
  const eventId = payload?.id || (paymentId ? `${eventType}:${paymentId}:sem-id-oficial` : `${eventType}:sem-identificador`);

  return {
    eventId,
    eventType,
    providerPaymentId: paymentId,
    providerSubscriptionId: payload?.payment?.subscription || null,
    externalReference: payload?.payment?.externalReference || null,
    value: typeof payload?.payment?.value === "number" ? payload.payment.value : null,
    dueDate: payload?.payment?.dueDate || null,
    isPaymentConfirmation: PAYMENT_CONFIRMATION_EVENTS.has(eventType),
    isOverdue: PAYMENT_OVERDUE_EVENTS.has(eventType),
  };
}
