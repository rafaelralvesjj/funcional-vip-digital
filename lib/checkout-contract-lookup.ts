/**
 * Decisão pura de "qual contrato pago já existe" para o checkout
 * self-service (app/api/aluno/checkout/route.ts) — extraída para ser
 * testável sem banco/sessão/Asaas (ver tests/checkout-contract-lookup.test.ts).
 */

type PaidContractLike = {
  type: string;
  status: string;
  endDate: Date | string;
  [key: string]: unknown;
};

/**
 * Um contrato PAID ACTIVE só bloqueia um novo checkout enquanto ainda está
 * em vigor — aqui o endDate É a data real de término (um instante preciso,
 * sempre gravado como fim do dia civil de America/Sao_Paulo por
 * lib/civil-month.ts), não um placeholder. Comparação direta de instante
 * (getTime() >= getTime()), nunca truncando para "início do dia" com
 * setHours(0,0,0,0): isso dependeria do fuso horário do HOST rodando o
 * processo (na Vercel, UTC) e poderia considerar "ainda vigente" um
 * contrato que, em America/Sao_Paulo, já expirou — ou vice-versa.
 */
export function findActivePaidContract<T extends PaidContractLike>(
  contracts: T[],
  referenceDate: Date = new Date()
): T | undefined {
  return contracts.find((contract) => {
    if (contract.type !== "PAID") return false;
    if (contract.status !== "ACTIVE") return false;
    return new Date(contract.endDate).getTime() >= referenceDate.getTime();
  });
}

/**
 * A reserva PAID AWAITING_PAYMENT pendente é identificada só por
 * tipo+status — NUNCA filtrando por endDate. O endDate de uma reserva
 * AWAITING_PAYMENT é apenas um placeholder de duração calculado na criação
 * (addMonthsMinusOneDay); numa reserva antiga ele pode já estar no passado
 * sem que isso signifique que a reserva expirou — a vigência real de um
 * contrato pago só nasce quando o pagamento é confirmado. Filtrar por
 * endDate aqui faria essa reserva antiga ficar invisível: o checkout
 * tentaria reservar de novo, colidiria no índice único parcial (um PAID
 * AWAITING_PAYMENT por aluno) e o aluno ficaria preso em
 * CHECKOUT_IN_PROGRESS para sempre.
 */
export function findPendingPaidReservation<T extends PaidContractLike>(contracts: T[]): T | undefined {
  return contracts.find((contract) => contract.type === "PAID" && contract.status === "AWAITING_PAYMENT");
}

type PaymentLike = {
  status: string;
  [key: string]: unknown;
};

// Status de ContractPayment que ainda representam a MESMA tentativa de
// cobrança, nunca uma cobrança encerrada/cancelada. O webhook (ver
// lib/asaas-webhook-processor.ts, PAYMENT_OVERDUE) transforma EM_ABERTO em
// ATRASADO quando a Asaas marca o vencimento sem pagamento — isso não torna
// a reserva "concluída" nem libera o aluno para gerar outra: o mesmo
// contrato/pagamento continua sendo o caminho de retomada.
const RESUMABLE_PENDING_PAYMENT_STATUSES = new Set(["EM_ABERTO", "ATRASADO"]);

/**
 * A cobrança de uma reserva AWAITING_PAYMENT ainda pendente — EM_ABERTO (o
 * pagamento nunca venceu) ou ATRASADO (venceu sem confirmação, mas ainda é
 * a cobrança que o aluno precisa pagar). Sem isso, um pagamento marcado
 * ATRASADO pelo webhook ficaria com o StudentContract preso em
 * AWAITING_PAYMENT (protegido pelo índice único parcial) sem nenhum
 * ContractPayment "visível" para o checkout retomar — o aluno não
 * conseguiria gerar uma nova reserva (índice único) nem reaproveitar a
 * antiga (filtro restrito a EM_ABERTO).
 */
export function findResumablePendingPayment<T extends PaymentLike>(payments: T[]): T | undefined {
  return payments.find((payment) => RESUMABLE_PENDING_PAYMENT_STATUSES.has(payment.status));
}
