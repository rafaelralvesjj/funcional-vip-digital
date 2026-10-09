import { resolvePaidContractStart } from "./trial-window";

/**
 * Decide o que fazer quando um pagamento é (ou ainda não é) confirmado para
 * um contrato pago — hoje chamado pela conversão manual EM_ABERTO → PAGO
 * (app/api/student-contracts/convert-trial/route.ts), e pensado para ser o
 * mesmo ponto que o futuro webhook do Asaas vai chamar quando a confirmação
 * de pagamento chegar de forma assíncrona. Centralizar aqui evita que o
 * webhook reimplemente (e possa dessincronizar) a regra de nunca encurtar o
 * teste — ver resolvePaidContractStart em lib/trial-window.ts.
 */
export type ContractPaymentTransitionInput = {
  /** Status do pagamento no momento da decisão (EM_ABERTO, PAGO, PARCIAL, ...). */
  paymentStatus: string;
  /**
   * endDate do TRIAL de origem, quando a conversão vem de uma experiência
   * ainda em curso. null/undefined quando não há teste a preservar (ex.:
   * contrato pago direto, sem experiência).
   */
  trialEndDate?: Date | null;
  /**
   * Data planejada pelo gestor para o contrato começar, usada somente
   * enquanto o pagamento ainda não está confirmado (EM_ABERTO/PARCIAL).
   */
  requestedStartDate: Date;
  /** Instante da confirmação do pagamento. Default: agora. */
  paymentConfirmedAt?: Date;
};

export type ContractPaymentTransition = {
  isPaymentConfirmed: boolean;
  /** true = pagamento confirmado durante o teste: início adiado para preservá-lo. */
  paidDuringTrial: boolean;
  /** true = o contrato pago já está em vigor agora (nunca true se paidDuringTrial). */
  shouldActivateNow: boolean;
  startDate: Date;
  status: "ACTIVE" | "AWAITING_PAYMENT";
  commercialStatus: "AGUARDANDO_PAGAMENTO" | "CONTRATO_PAGO_AGENDADO" | "CONTRATO_ATIVO";
  acceptedAt: Date | null;
  activatedAt: Date | null;
};

export function resolveContractPaymentTransition(
  input: ContractPaymentTransitionInput
): ContractPaymentTransition {
  const isPaymentConfirmed = String(input.paymentStatus || "").toUpperCase() === "PAGO";

  if (!isPaymentConfirmed) {
    return {
      isPaymentConfirmed: false,
      paidDuringTrial: false,
      shouldActivateNow: false,
      startDate: input.requestedStartDate,
      status: "AWAITING_PAYMENT",
      commercialStatus: "AGUARDANDO_PAGAMENTO",
      acceptedAt: null,
      activatedAt: null,
    };
  }

  const paymentConfirmedAt = input.paymentConfirmedAt ?? new Date();
  let startDate = paymentConfirmedAt;
  let paidDuringTrial = false;

  if (input.trialEndDate) {
    const resolution = resolvePaidContractStart({
      trialEndDate: input.trialEndDate,
      paymentConfirmedAt,
    });
    startDate = resolution.startDate;
    paidDuringTrial = resolution.paidDuringTrial;
  }

  const shouldActivateNow = !paidDuringTrial;

  return {
    isPaymentConfirmed: true,
    paidDuringTrial,
    shouldActivateNow,
    startDate,
    status: "ACTIVE",
    commercialStatus: paidDuringTrial ? "CONTRATO_PAGO_AGENDADO" : "CONTRATO_ATIVO",
    acceptedAt: paymentConfirmedAt,
    activatedAt: shouldActivateNow ? paymentConfirmedAt : null,
  };
}
