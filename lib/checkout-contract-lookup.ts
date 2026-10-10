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

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Um contrato PAID ACTIVE só bloqueia um novo checkout enquanto ainda está
 * em vigor (endDate não passou) — aqui o endDate É a data real de término,
 * não um placeholder.
 */
export function findActivePaidContract<T extends PaidContractLike>(
  contracts: T[],
  today: Date = new Date()
): T | undefined {
  const todayStart = startOfDay(today);

  return contracts.find((contract) => {
    if (contract.type !== "PAID") return false;
    if (contract.status !== "ACTIVE") return false;
    return startOfDay(new Date(contract.endDate)).getTime() >= todayStart.getTime();
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
