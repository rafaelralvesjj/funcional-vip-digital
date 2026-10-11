import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveCheckoutSlot, CheckoutAlreadyPendingError } from '../lib/checkout-reservation.ts';

/**
 * Fake do Prisma que reproduz, em memória, exatamente a regra do índice
 * único parcial criado na migration (um StudentContract PAID/AWAITING_PAYMENT
 * por studentId): a segunda tentativa de `create` para o mesmo aluno com
 * esse estado rejeita com o mesmo formato de erro que o Postgres devolveria
 * (P2002) através do Prisma. Isso testa a tradução feita por
 * reserveCheckoutSlot; a garantia de exclusão mútua em si é uma propriedade
 * do banco real, validável contra o Preview (mesma situação da unique
 * constraint da Fase 0/1).
 */
function createFakeReservationTx() {
  const contracts: any[] = [];
  const payments: any[] = [];

  const tx = {
    studentContract: {
      create: async ({ data }: { data: any }) => {
        const hasPendingPaid = contracts.some(
          (contract) =>
            contract.studentId === data.studentId &&
            contract.type === "PAID" &&
            contract.status === "AWAITING_PAYMENT"
        );

        if (hasPendingPaid) {
          const error: any = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }

        const created = { id: `contract-${contracts.length + 1}`, ...data };
        contracts.push(created);
        return created;
      },
    },
    contractPayment: {
      create: async ({ data }: { data: any }) => {
        const created = { id: `payment-${payments.length + 1}`, ...data };
        payments.push(created);
        return created;
      },
    },
  };

  return { tx, contracts, payments };
}

function buildContractData(overrides: Record<string, any> = {}) {
  return {
    studentId: "student-1",
    type: "PAID",
    status: "AWAITING_PAYMENT",
    ...overrides,
  };
}

test('reserveCheckoutSlot cria o contrato e o pagamento quando não há reserva pendente', async () => {
  const { tx, contracts, payments } = createFakeReservationTx();

  const result = await reserveCheckoutSlot(tx, {
    contractData: buildContractData(),
    buildPaymentData: (contractId) => ({ contractId, status: "EM_ABERTO" }),
  });

  assert.equal(contracts.length, 1);
  assert.equal(payments.length, 1);
  assert.equal(result.payment.contractId, result.contract.id);
});

test('reserveCheckoutSlot: duas tentativas para o mesmo aluno — a segunda falha com CheckoutAlreadyPendingError, nunca abre uma segunda reserva', async () => {
  const { tx, contracts } = createFakeReservationTx();

  const first = await reserveCheckoutSlot(tx, {
    contractData: buildContractData(),
    buildPaymentData: (contractId) => ({ contractId, status: "EM_ABERTO" }),
  });

  assert.ok(first.contract.id);

  await assert.rejects(
    () =>
      reserveCheckoutSlot(tx, {
        contractData: buildContractData(),
        buildPaymentData: (contractId) => ({ contractId, status: "EM_ABERTO" }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof CheckoutAlreadyPendingError);
      assert.equal((error as CheckoutAlreadyPendingError).studentId, "student-1");
      return true;
    }
  );

  // Só uma reserva existe — a segunda tentativa nunca escreveu nada.
  assert.equal(contracts.length, 1);
});

test('reserveCheckoutSlot: alunos diferentes nunca colidem entre si', async () => {
  const { tx, contracts } = createFakeReservationTx();

  await reserveCheckoutSlot(tx, {
    contractData: buildContractData({ studentId: "student-1" }),
    buildPaymentData: (contractId) => ({ contractId, status: "EM_ABERTO" }),
  });

  await reserveCheckoutSlot(tx, {
    contractData: buildContractData({ studentId: "student-2" }),
    buildPaymentData: (contractId) => ({ contractId, status: "EM_ABERTO" }),
  });

  assert.equal(contracts.length, 2);
});

test('reserveCheckoutSlot propaga erros que não são de unique constraint', async () => {
  const tx = {
    studentContract: {
      create: async () => {
        throw new Error("falha de conexão genérica");
      },
    },
    contractPayment: {
      create: async () => ({ id: "payment-x" }),
    },
  };

  await assert.rejects(
    () =>
      reserveCheckoutSlot(tx as any, {
        contractData: buildContractData(),
        buildPaymentData: (contractId) => ({ contractId }),
      }),
    /falha de conexão genérica/
  );
});
