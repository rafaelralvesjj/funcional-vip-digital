/**
 * Reserva local, atômica e durável de um checkout antes de qualquer chamada
 * à Asaas — a trava real é o índice único parcial do Postgres
 * (student_contracts_one_pending_paid_per_student, ver a migration
 * 20261009230000_asaas_checkout_review_fixes), que impede duas requisições
 * concorrentes de criarem dois StudentContract PAID/AWAITING_PAYMENT para o
 * mesmo aluno. Esta função só traduz a violação dessa constraint (P2002) em
 * um erro de domínio claro; sem ela, o fluxo "consulta banco -> cria na
 * Asaas -> grava banco" deixaria uma janela onde duas requisições
 * simultâneas passam pela consulta antes de qualquer uma escrever, e cada
 * uma acabaria abrindo sua própria cobrança/assinatura na Asaas.
 *
 * A verificação de duplicidade em si (o índice único) só é validável contra
 * um Postgres real — como a unique constraint da Fase 0/1 (PR #8), precisa
 * ser confirmada na validação do banco de Preview. O que é testável aqui
 * (tests/checkout-reservation.test.ts) é esta tradução: uma segunda
 * tentativa para o mesmo aluno, contra um "banco" que já rejeitaria a
 * segunda escrita, deve virar CheckoutAlreadyPendingError e nunca uma
 * segunda reserva bem-sucedida.
 */
export class CheckoutAlreadyPendingError extends Error {
  constructor(public readonly studentId: string) {
    super("Já existe uma tentativa de checkout em andamento para este aluno.");
  }
}

export type CheckoutReservationTx = {
  studentContract: {
    create: (args: { data: any }) => Promise<any>;
  };
  contractPayment: {
    create: (args: { data: any }) => Promise<any>;
  };
};

export async function reserveCheckoutSlot(
  tx: CheckoutReservationTx,
  params: {
    contractData: Record<string, any> & { studentId: string };
    buildPaymentData: (contractId: string) => Record<string, any>;
  }
): Promise<{ contract: any; payment: any }> {
  let contract: any;

  try {
    contract = await tx.studentContract.create({ data: params.contractData });
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new CheckoutAlreadyPendingError(params.contractData.studentId);
    }
    throw error;
  }

  const payment = await tx.contractPayment.create({ data: params.buildPaymentData(contract.id) });

  return { contract, payment };
}
