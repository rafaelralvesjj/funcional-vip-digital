import { resolveContractPaymentTransition } from "./contract-payment-transition";

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

export type ContractTx = {
  studentContract: {
    findUnique: (args: { where: { id: string } }) => Promise<any>;
    update: (args: { where: { id: string }; data: any }) => Promise<any>;
    updateMany: (args: { where: any; data: any }) => Promise<any>;
  };
  student: {
    update: (args: { where: { id: string }; data: any }) => Promise<any>;
  };
};

/**
 * Transição EM_ABERTO → PAGO para um contrato PAID originado de uma
 * experiência (renewedFromContractId aponta para o TRIAL de origem) —
 * chamada por app/api/contract-payments/route.ts (confirmação manual de
 * pagamento) e pensada para ser o mesmo ponto que o futuro webhook do Asaas
 * vai chamar quando a confirmação chegar de forma assíncrona. Delega a
 * decisão toda (status/commercialStatus/startDate/acceptedAt/activatedAt)
 * para resolveContractPaymentTransition, para nunca reimplementar (e
 * arriscar dessincronizar) a regra de preservar os 7 dias de teste quando o
 * pagamento é antecipado.
 *
 * Idempotente: se o contrato já tem acceptedAt (uma confirmação anterior já
 * aplicou a transição), não recalcula nem desloca startDate/endDate de novo
 * — uma segunda confirmação do mesmo pagamento (ex.: reenvio de webhook, ou
 * o gestor confirmando duas vezes) não pode mexer nas datas outra vez.
 */
export async function activatePaidContractFromTrial(
  tx: ContractTx,
  contract: any,
  paymentConfirmedAt: Date
) {
  if (contract.acceptedAt) {
    return contract;
  }

  const trial = contract.renewedFromContractId
    ? await tx.studentContract.findUnique({
        where: { id: contract.renewedFromContractId },
      })
    : null;

  const transition = resolveContractPaymentTransition({
    paymentStatus: "PAGO",
    trialEndDate: trial && trial.type === "TRIAL" ? trial.endDate : null,
    requestedStartDate: contract.startDate,
    paymentConfirmedAt,
  });

  const endDate = addMonthsMinusOneDay(transition.startDate, contract.durationMonths || 1);

  if (transition.shouldActivateNow) {
    // Só finaliza o contrato anterior (ex.: o próprio TRIAL) quando o PAID
    // realmente entra em vigor agora. Quando paidDuringTrial é true, o TRIAL
    // em curso NÃO pode ser finalizado — continua valendo até seu endDate.
    await tx.studentContract.updateMany({
      where: {
        studentId: contract.studentId,
        status: "ACTIVE",
        id: {
          not: contract.id,
        },
      },
      data: {
        status: "FINALIZED",
        commercialStatus: "FINALIZADO",
        finalizedAt: paymentConfirmedAt,
      },
    });
  }

  const updatedContract = await tx.studentContract.update({
    where: {
      id: contract.id,
    },
    data: {
      status: transition.status,
      commercialStatus: transition.commercialStatus,
      startDate: transition.startDate,
      endDate,
      acceptedAt: transition.acceptedAt,
      activatedAt: transition.activatedAt,
      finalizedAt: null,
      cancelledAt: null,
      suspendedAt: null,
    },
  });

  if (transition.shouldActivateNow) {
    await tx.student.update({
      where: {
        id: contract.studentId,
      },
      data: {
        commercialStatus: "CONTRATO_ATIVO",
        contractedTrainingDaysPerMonth: contract.workoutsPerMonth,
        ...(contract.professorId ? { userId: contract.professorId } : {}),
      },
    });
  }

  return updatedContract;
}

/**
 * Renovação de uma assinatura MONTHLY já ativa (não é a primeira
 * confirmação — essa passa por activatePaidContractFromTrial). Cada nova
 * mensalidade confirmada pela Asaas estende o período de acesso em mais um
 * mês a partir do endDate atual (nunca da data de pagamento, para não criar
 * lacuna nem sobreposição entre ciclos pagos em dias ligeiramente
 * diferentes) — a menos que o acesso já tenha expirado (ex.: pagamento
 * atrasado processado depois do vencimento), caso em que o novo mês conta a
 * partir da confirmação.
 */
export function extendMonthlyAccessPeriod(params: {
  currentEndDate: Date;
  paymentConfirmedAt: Date;
}): Date {
  const base =
    params.currentEndDate.getTime() >= params.paymentConfirmedAt.getTime()
      ? new Date(params.currentEndDate)
      : new Date(params.paymentConfirmedAt);

  const extended = new Date(base);
  extended.setMonth(extended.getMonth() + 1);
  return extended;
}
