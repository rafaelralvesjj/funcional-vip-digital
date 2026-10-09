import { activatePaidContractFromTrial, type ContractTx } from "./contract-activation";
import type { NormalizedAsaasWebhookEvent } from "./asaas-webhook";

export type AsaasWebhookProcessorTx = ContractTx & {
  contractPayment: {
    findUnique: (args: { where: { providerPaymentId: string } }) => Promise<any>;
    findFirst: (args: { where: { externalReference: string } }) => Promise<any>;
    update: (args: { where: { id: string }; data: any }) => Promise<any>;
  };
};

/**
 * Lógica de negócio do webhook, separada da orquestração de idempotência
 * (WebhookEvent) que vive na rota — para poder ser testada com um fake de
 * `tx` (sem banco), do mesmo jeito que activatePaidContractFromTrial em
 * tests/contract-activation.test.ts.
 *
 * Confirmação de pagamento (PAYMENT_CONFIRMED/PAYMENT_RECEIVED): localiza o
 * ContractPayment por providerPaymentId (ou, na falta, por
 * externalReference), marca PAGO e delega a ativação do contrato a
 * activatePaidContractFromTrial — a MESMA função que a conversão manual
 * usa, garantindo que o webhook nunca reimplemente (e desincronize) a regra
 * de preservar o teste quando o pagamento é antecipado.
 *
 * PAYMENT_OVERDUE só marca o ContractPayment como ATRASADO, sem mexer no
 * contrato. Qualquer outro tipo de evento é no-op (a rota responde 200
 * mesmo assim, para a Asaas não ficar retentando).
 */
export async function processAsaasWebhookEvent(
  tx: AsaasWebhookProcessorTx,
  normalized: NormalizedAsaasWebhookEvent
): Promise<{ handled: boolean; reason?: string }> {
  if (normalized.isPaymentConfirmation) {
    const payment =
      (normalized.providerPaymentId
        ? await tx.contractPayment.findUnique({
            where: { providerPaymentId: normalized.providerPaymentId },
          })
        : null) ||
      (normalized.externalReference
        ? await tx.contractPayment.findFirst({
            where: { externalReference: normalized.externalReference },
          })
        : null);

    if (!payment) {
      return { handled: false, reason: "payment_not_found" };
    }

    const paymentConfirmedAt = payment.paidAt || new Date();

    if (payment.status !== "PAGO") {
      await tx.contractPayment.update({
        where: { id: payment.id },
        data: {
          status: "PAGO",
          paidAt: paymentConfirmedAt,
          providerPaymentId: payment.providerPaymentId || normalized.providerPaymentId,
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

  if (normalized.isOverdue && normalized.providerPaymentId) {
    const payment = await tx.contractPayment.findUnique({
      where: { providerPaymentId: normalized.providerPaymentId },
    });

    if (payment && payment.status === "EM_ABERTO") {
      await tx.contractPayment.update({
        where: { id: payment.id },
        data: { status: "ATRASADO" },
      });
      return { handled: true };
    }

    return { handled: false, reason: "payment_not_found_or_not_open" };
  }

  return { handled: false, reason: "event_type_ignored" };
}
