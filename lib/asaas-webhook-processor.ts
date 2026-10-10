import { activatePaidContractFromTrial, extendMonthlyAccessPeriod, type ContractTx } from "./contract-activation";
import type { NormalizedAsaasWebhookEvent } from "./asaas-webhook";

export type AsaasWebhookProcessorTx = ContractTx & {
  contractPayment: {
    findUnique: (args: { where: { providerPaymentId: string } }) => Promise<any>;
    findFirst: (args: { where: Record<string, any> }) => Promise<any>;
    create: (args: { data: any }) => Promise<any>;
    update: (args: { where: { id: string }; data: any }) => Promise<any>;
  };
};

export type ProcessWebhookResult = {
  handled: boolean;
  reason?:
    | "payment_not_found"
    | "contract_not_found"
    | "payment_not_open"
    | "event_type_ignored";
};

/**
 * Razões que significam "ainda não temos o registro local correspondente" —
 * quase sempre uma corrida entre o webhook chegando e a nossa própria
 * persistência (checkout) terminando de gravar. NUNCA podem ser tratadas
 * como "evento resolvido": a rota (app/api/webhooks/asaas/route.ts) usa isto
 * para decidir não marcar o WebhookEvent como processado e devolver um
 * status que faz a Asaas reentregar o webhook mais tarde — perder um desses
 * eventos significa um pagamento confirmado que nunca ativa o contrato.
 */
const RETRIABLE_REASONS = new Set<ProcessWebhookResult["reason"]>([
  "payment_not_found",
  "contract_not_found",
]);

export function isRetriableWebhookReason(reason: ProcessWebhookResult["reason"] | undefined): boolean {
  return Boolean(reason && RETRIABLE_REASONS.has(reason));
}

/**
 * Lógica de negócio do webhook, separada da orquestração de idempotência
 * (WebhookEvent) que vive na rota — para poder ser testada com um fake de
 * `tx` (sem banco), do mesmo jeito que activatePaidContractFromTrial em
 * tests/contract-activation.test.ts.
 *
 * Confirmação de pagamento (PAYMENT_CONFIRMED/PAYMENT_RECEIVED), nesta
 * ordem de prioridade (importa: ver nota sobre externalReference abaixo):
 * 1. Localiza o ContractPayment por providerPaymentId — é a MESMA cobrança
 *    já registrada (ex.: reentrega do mesmo evento, ou a primeira
 *    confirmação do checkout). Marca PAGO e delega a ativação do contrato a
 *    activatePaidContractFromTrial — a MESMA função que a conversão manual
 *    usa, garantindo que o webhook nunca reimplemente (e desincronize) a
 *    regra de preservar o teste quando o pagamento é antecipado.
 * 2. Se não achar por providerPaymentId mas o evento trouxer
 *    providerSubscriptionId, procura outro ContractPayment da MESMA
 *    assinatura (qualquer um, para achar o contrato) — isso significa uma
 *    NOVA mensalidade gerada pela Asaas (payment.id sempre muda a cada
 *    ciclo). Cria um ContractPayment PRÓPRIO para essa cobrança (nunca
 *    reaproveita a linha da primeira mensalidade) e, dependendo do estado do
 *    contrato: se ainda não tinha sido ativado (acceptedAt nulo), é na
 *    verdade a primeira confirmação (delega a activatePaidContractFromTrial
 *    normalmente); se já estava ativo, é uma renovação — estende o período
 *    de acesso (extendMonthlyAccessPeriod) sem reprocessar a ativação.
 *    ESSA checagem vem antes de externalReference de propósito: o checkout
 *    pode gravar o MESMO externalReference em toda a assinatura (é o
 *    identificador do checkout, não de uma cobrança específica), então uma
 *    busca por externalReference encontraria a cobrança do primeiro mês e
 *    "engoliria" a nova mensalidade como se já estivesse paga — nunca
 *    criando a linha nova nem estendendo o acesso.
 * 3. externalReference só entra como último recurso de reconciliação (ex.:
 *    cobrança ANNUAL cujo providerPaymentId não foi capturado no checkout
 *    por alguma falha) — nunca antes do passo 2, e nunca pode transformar
 *    uma nova mensalidade de uma assinatura na cobrança anterior.
 * 4. Se não achar de nenhuma forma, devolve reason="payment_not_found"
 *    (retriable — ver isRetriableWebhookReason).
 *
 * PAYMENT_OVERDUE só marca o ContractPayment como ATRASADO, sem mexer no
 * contrato. Qualquer outro tipo de evento é no-op final (a rota responde 200
 * mesmo assim, para a Asaas não ficar retentando algo que não vamos tratar).
 */
export async function processAsaasWebhookEvent(
  tx: AsaasWebhookProcessorTx,
  normalized: NormalizedAsaasWebhookEvent
): Promise<ProcessWebhookResult> {
  if (normalized.isPaymentConfirmation) {
    return processPaymentConfirmation(tx, normalized);
  }

  if (normalized.isOverdue) {
    return processOverdue(tx, normalized);
  }

  return { handled: false, reason: "event_type_ignored" };
}

async function findPaymentByProviderPaymentId(tx: AsaasWebhookProcessorTx, providerPaymentId: string | null) {
  if (!providerPaymentId) return null;
  return tx.contractPayment.findUnique({ where: { providerPaymentId } });
}

async function findAnyPaymentBySubscription(tx: AsaasWebhookProcessorTx, providerSubscriptionId: string | null) {
  if (!providerSubscriptionId) return null;
  return tx.contractPayment.findFirst({ where: { providerSubscriptionId } });
}

async function processPaymentConfirmation(
  tx: AsaasWebhookProcessorTx,
  normalized: NormalizedAsaasWebhookEvent
): Promise<ProcessWebhookResult> {
  // 1. Mesma cobrança já conhecida.
  const byProviderPaymentId = await findPaymentByProviderPaymentId(tx, normalized.providerPaymentId);
  if (byProviderPaymentId) {
    return confirmExistingPayment(tx, byProviderPaymentId, normalized);
  }

  // 2. payment.id novo, mas a assinatura já é conhecida: nova mensalidade
  // recorrente — tem que vir ANTES de externalReference (ver docstring).
  const sameSubscriptionPayment = await findAnyPaymentBySubscription(tx, normalized.providerSubscriptionId);
  if (sameSubscriptionPayment) {
    return confirmNewRecurringCycle(tx, sameSubscriptionPayment, normalized);
  }

  // 3. externalReference: só reconciliação/fallback.
  const byExternalReference = normalized.externalReference
    ? await tx.contractPayment.findFirst({ where: { externalReference: normalized.externalReference } })
    : null;
  if (byExternalReference) {
    return confirmExistingPayment(tx, byExternalReference, normalized);
  }

  return { handled: false, reason: "payment_not_found" };
}

async function confirmExistingPayment(
  tx: AsaasWebhookProcessorTx,
  payment: any,
  normalized: NormalizedAsaasWebhookEvent
): Promise<ProcessWebhookResult> {
  const paymentConfirmedAt = payment.paidAt || new Date();

  if (payment.status !== "PAGO") {
    await tx.contractPayment.update({
      where: { id: payment.id },
      data: {
        status: "PAGO",
        paidAt: paymentConfirmedAt,
        providerPaymentId: payment.providerPaymentId || normalized.providerPaymentId,
        providerSubscriptionId: payment.providerSubscriptionId || normalized.providerSubscriptionId,
      },
    });
  }

  const contract = await tx.studentContract.findUnique({ where: { id: payment.contractId } });

  if (!contract) {
    return { handled: false, reason: "contract_not_found" };
  }

  await activatePaidContractFromTrial(tx, contract, paymentConfirmedAt);
  return { handled: true };
}

async function confirmNewRecurringCycle(
  tx: AsaasWebhookProcessorTx,
  previousPayment: any,
  normalized: NormalizedAsaasWebhookEvent
): Promise<ProcessWebhookResult> {
  const contract = await tx.studentContract.findUnique({ where: { id: previousPayment.contractId } });

  if (!contract) {
    return { handled: false, reason: "contract_not_found" };
  }

  const paymentConfirmedAt = new Date();
  const amountCents =
    typeof normalized.value === "number" ? Math.round(normalized.value * 100) : previousPayment.amountCents;
  const dueDate = normalized.dueDate ? new Date(`${normalized.dueDate}T12:00:00`) : paymentConfirmedAt;

  // ContractPayment PRÓPRIO para esta mensalidade — nunca reaproveita a
  // linha da cobrança anterior, para manter o histórico de cada ciclo pago.
  await tx.contractPayment.create({
    data: {
      contractId: contract.id,
      studentId: previousPayment.studentId,
      amountCents,
      dueDate,
      status: "PAGO",
      paidAt: paymentConfirmedAt,
      method: previousPayment.method || "UNDEFINED",
      provider: "ASAAS",
      externalReference: normalized.externalReference || previousPayment.externalReference,
      providerPaymentId: normalized.providerPaymentId,
      providerSubscriptionId: normalized.providerSubscriptionId,
    },
  });

  if (!contract.acceptedAt) {
    // O contrato ainda não tinha sido ativado (ex.: a primeira mensalidade
    // da assinatura confirmou direto nesta nova cobrança, sem passar antes
    // por confirmExistingPayment). Trata como a primeira confirmação de
    // verdade.
    await activatePaidContractFromTrial(tx, contract, paymentConfirmedAt);
    return { handled: true };
  }

  // Contrato já ativo: isto é uma renovação — estende o acesso, não
  // reativa nem reprocessa a transição EM_ABERTO -> PAGO de novo.
  const newEndDate = extendMonthlyAccessPeriod({
    currentEndDate: new Date(contract.endDate),
    paymentConfirmedAt,
  });

  await tx.studentContract.update({
    where: { id: contract.id },
    data: { endDate: newEndDate },
  });

  return { handled: true };
}

async function processOverdue(
  tx: AsaasWebhookProcessorTx,
  normalized: NormalizedAsaasWebhookEvent
): Promise<ProcessWebhookResult> {
  if (!normalized.providerPaymentId) {
    return { handled: false, reason: "payment_not_found" };
  }

  const payment = await findPaymentByProviderPaymentId(tx, normalized.providerPaymentId);

  if (!payment) {
    return { handled: false, reason: "payment_not_found" };
  }

  if (payment.status !== "EM_ABERTO") {
    return { handled: false, reason: "payment_not_open" };
  }

  await tx.contractPayment.update({
    where: { id: payment.id },
    data: { status: "ATRASADO" },
  });

  return { handled: true };
}
