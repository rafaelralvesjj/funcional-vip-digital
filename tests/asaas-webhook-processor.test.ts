import test from 'node:test';
import assert from 'node:assert/strict';
import { processAsaasWebhookEvent } from '../lib/asaas-webhook-processor.ts';
import { normalizeAsaasWebhookEvent } from '../lib/asaas-webhook.ts';

type Row = Record<string, any>;

/**
 * Fake mínimo do Prisma $transaction cobrindo studentContract, student e
 * contractPayment — o suficiente para exercitar processAsaasWebhookEvent
 * (que delega a maior parte da decisão a activatePaidContractFromTrial,
 * já testado isoladamente em tests/contract-activation.test.ts) sem banco.
 */
function createFakeTx(params: { contracts?: Row[]; payments?: Row[] }) {
  const contractsById = new Map<string, Row>();
  for (const contract of params.contracts || []) contractsById.set(contract.id, { ...contract });

  const paymentsById = new Map<string, Row>();
  for (const payment of params.payments || []) paymentsById.set(payment.id, { ...payment });

  const studentUpdates: Row[] = [];

  const tx = {
    studentContract: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = contractsById.get(where.id);
        return found ? { ...found } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const updated = { ...contractsById.get(where.id), ...data };
        contractsById.set(where.id, updated);
        return { ...updated };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const [id, contract] of contractsById.entries()) {
          if (where.studentId && contract.studentId !== where.studentId) continue;
          if (where.status && contract.status !== where.status) continue;
          if (where.id?.not && id === where.id.not) continue;
          contractsById.set(id, { ...contract, ...data });
          count += 1;
        }
        return { count };
      },
    },
    student: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        studentUpdates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
    contractPayment: {
      findUnique: async ({ where }: { where: { providerPaymentId: string } }) => {
        for (const payment of paymentsById.values()) {
          if (payment.providerPaymentId === where.providerPaymentId) return { ...payment };
        }
        return null;
      },
      findFirst: async ({ where }: { where: { externalReference: string } }) => {
        for (const payment of paymentsById.values()) {
          if (payment.externalReference === where.externalReference) return { ...payment };
        }
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const updated = { ...paymentsById.get(where.id), ...data };
        paymentsById.set(where.id, updated);
        return { ...updated };
      },
    },
  };

  return { tx, contractsById, paymentsById, studentUpdates };
}

const trialEndDate = new Date('2026-10-16T23:59:59.999-03:00');

function buildTrial(): Row {
  return {
    id: 'trial-1',
    studentId: 'student-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    commercialStatus: 'EXPERIENCIA_ATIVA',
    startDate: new Date('2026-10-10T00:00:00-03:00'),
    endDate: trialEndDate,
  };
}

function buildPendingContract(overrides: Row = {}): Row {
  return {
    id: 'paid-1',
    studentId: 'student-1',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    commercialStatus: 'AGUARDANDO_PAGAMENTO',
    startDate: new Date('2026-10-14T12:00:00-03:00'),
    endDate: new Date('2026-11-13T12:00:00-03:00'),
    durationMonths: 1,
    workoutsPerMonth: 12,
    professorId: null,
    renewedFromContractId: 'trial-1',
    acceptedAt: null,
    activatedAt: null,
    ...overrides,
  };
}

function buildPendingPayment(overrides: Row = {}): Row {
  return {
    id: 'payment-1',
    contractId: 'paid-1',
    status: 'EM_ABERTO',
    providerPaymentId: 'pay_asaas_123',
    externalReference: 'chk_abc',
    paidAt: null,
    ...overrides,
  };
}

test('PAYMENT_CONFIRMED durante o teste: marca o pagamento PAGO e agenda o contrato sem finalizar o TRIAL', async () => {
  const trial = buildTrial();
  const contract = buildPendingContract();
  // paidAt fixo (não depende do relógio real da máquina que roda o teste):
  // ainda dentro do teste, que termina em 2026-10-16.
  const payment = buildPendingPayment({ paidAt: new Date('2026-10-14T09:00:00-03:00') });
  const { tx, contractsById, paymentsById } = createFakeTx({
    contracts: [trial, contract],
    payments: [payment],
  });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_asaas_123', status: 'CONFIRMED', externalReference: 'chk_abc' },
  });

  const result = await processAsaasWebhookEvent(tx as any, normalized);

  assert.equal(result.handled, true);
  assert.equal(paymentsById.get('payment-1')?.status, 'PAGO');

  const updatedContract = contractsById.get('paid-1');
  assert.equal(updatedContract?.commercialStatus, 'CONTRATO_PAGO_AGENDADO');
  assert.equal(contractsById.get('trial-1')?.status, 'ACTIVE');
});

test('PAYMENT_RECEIVED depois do fim do teste: ativa o contrato imediatamente e finaliza o TRIAL', async () => {
  const trial = buildTrial();
  const contract = buildPendingContract();
  const payment = buildPendingPayment();
  const { tx, contractsById, paymentsById } = createFakeTx({
    contracts: [trial, contract],
    payments: [payment],
  });

  // Simula confirmação tardia: ajusta paidAt para depois do fim do teste
  // sobrescrevendo o objeto antes de processar (payment.paidAt é usado como
  // paymentConfirmedAt quando já setado).
  paymentsById.set('payment-1', { ...payment, paidAt: new Date('2026-10-20T09:00:00-03:00') });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_asaas_123', status: 'RECEIVED' },
  });

  await processAsaasWebhookEvent(tx as any, normalized);

  assert.equal(contractsById.get('paid-1')?.commercialStatus, 'CONTRATO_ATIVO');
  assert.equal(contractsById.get('trial-1')?.status, 'FINALIZED');
});

test('confirmação repetida (payment já PAGO): idempotente, não reprocessa nem desloca nada de novo', async () => {
  const contract = buildPendingContract({
    status: 'ACTIVE',
    commercialStatus: 'CONTRATO_PAGO_AGENDADO',
    acceptedAt: new Date('2026-10-14T09:00:00-03:00'),
  });
  const payment = buildPendingPayment({ status: 'PAGO', paidAt: new Date('2026-10-14T09:00:00-03:00') });
  const { tx, contractsById, paymentsById } = createFakeTx({ contracts: [contract], payments: [payment] });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_asaas_123', status: 'CONFIRMED' },
  });

  const result = await processAsaasWebhookEvent(tx as any, normalized);

  assert.equal(result.handled, true);
  // Nada muda: contrato já tinha acceptedAt, pagamento já estava PAGO.
  assert.deepEqual(contractsById.get('paid-1'), contract);
  assert.deepEqual(paymentsById.get('payment-1'), payment);
});

test('pagamento não encontrado localmente: handled=false, não lança', async () => {
  const { tx } = createFakeTx({ contracts: [], payments: [] });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_desconhecido', status: 'CONFIRMED' },
  });

  const result = await processAsaasWebhookEvent(tx as any, normalized);
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'payment_not_found');
});

test('PAYMENT_OVERDUE marca o pagamento ATRASADO sem mexer no contrato', async () => {
  const contract = buildPendingContract();
  const payment = buildPendingPayment();
  const { tx, contractsById, paymentsById } = createFakeTx({ contracts: [contract], payments: [payment] });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_OVERDUE',
    payment: { id: 'pay_asaas_123', status: 'OVERDUE' },
  });

  const result = await processAsaasWebhookEvent(tx as any, normalized);

  assert.equal(result.handled, true);
  assert.equal(paymentsById.get('payment-1')?.status, 'ATRASADO');
  assert.deepEqual(contractsById.get('paid-1'), contract);
});

test('evento desconhecido é ignorado (handled=false), sem nenhuma escrita', async () => {
  const contract = buildPendingContract();
  const payment = buildPendingPayment();
  const { tx, contractsById, paymentsById } = createFakeTx({ contracts: [contract], payments: [payment] });

  const normalized = normalizeAsaasWebhookEvent({
    event: 'PAYMENT_UPDATED',
    payment: { id: 'pay_asaas_123', status: 'PENDING' },
  });

  const result = await processAsaasWebhookEvent(tx as any, normalized);

  assert.equal(result.handled, false);
  assert.equal(result.reason, 'event_type_ignored');
  assert.deepEqual(contractsById.get('paid-1'), contract);
  assert.deepEqual(paymentsById.get('payment-1'), payment);
});
