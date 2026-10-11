import test from 'node:test';
import assert from 'node:assert/strict';
import { activatePaidContractFromTrial, extendMonthlyAccessPeriod } from '../lib/contract-activation.ts';

type FakeContractRecord = Record<string, any>;

/**
 * Fake mínimo do Prisma $transaction (tx) só com o que
 * activatePaidContractFromTrial usa: studentContract.findUnique/update/
 * updateMany e student.update. Sem banco real, mas testa o comportamento de
 * verdade (o que é escrito), não só a forma do código-fonte.
 */
function createFakeTx(contracts: FakeContractRecord[]) {
  const byId = new Map<string, FakeContractRecord>();
  for (const contract of contracts) {
    byId.set(contract.id, { ...contract });
  }
  const studentUpdates: any[] = [];

  const tx = {
    studentContract: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = byId.get(where.id);
        return found ? { ...found } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const existing = byId.get(where.id);
        const updated = { ...existing, ...data };
        byId.set(where.id, updated);
        return { ...updated };
      },
      updateMany: async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const [id, contract] of byId.entries()) {
          if (where.studentId && contract.studentId !== where.studentId) continue;
          if (where.status && contract.status !== where.status) continue;
          if (where.id?.not && id === where.id.not) continue;
          byId.set(id, { ...contract, ...data });
          count += 1;
        }
        return { count };
      },
    },
    student: {
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        studentUpdates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
  };

  return { tx, byId, studentUpdates };
}

const trialEndDate = new Date('2026-10-16T23:59:59.999-03:00');

function buildTrial(overrides: FakeContractRecord = {}): FakeContractRecord {
  return {
    id: 'trial-1',
    studentId: 'student-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    commercialStatus: 'EXPERIENCIA_ATIVA',
    startDate: new Date('2026-10-10T00:00:00-03:00'),
    endDate: trialEndDate,
    ...overrides,
  };
}

function buildPendingPaidContract(overrides: FakeContractRecord = {}): FakeContractRecord {
  return {
    id: 'paid-1',
    studentId: 'student-1',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    commercialStatus: 'AGUARDANDO_PAGAMENTO',
    startDate: new Date('2026-11-01T12:00:00-03:00'),
    endDate: new Date('2026-11-30T12:00:00-03:00'),
    durationMonths: 1,
    workoutsPerMonth: 12,
    professorId: null,
    renewedFromContractId: 'trial-1',
    acceptedAt: null,
    activatedAt: null,
    ...overrides,
  };
}

test('EM_ABERTO -> PAGO durante o teste: PAID fica agendado (CONTRATO_PAGO_AGENDADO) e o TRIAL é preservado', async () => {
  const trial = buildTrial();
  const paidContract = buildPendingPaidContract();
  const { tx, byId } = createFakeTx([trial, paidContract]);

  const paymentConfirmedAt = new Date('2026-10-14T09:00:00-03:00'); // ainda dentro do teste

  const updated = await activatePaidContractFromTrial(tx, paidContract, paymentConfirmedAt);

  assert.equal(updated.status, 'ACTIVE');
  assert.equal(updated.commercialStatus, 'CONTRATO_PAGO_AGENDADO');
  assert.equal(updated.startDate.toISOString(), '2026-10-17T03:00:00.000Z');
  assert.equal(updated.activatedAt, null);
  assert.equal(updated.acceptedAt?.getTime(), paymentConfirmedAt.getTime());

  // TRIAL não pode ter sido finalizado: continua ACTIVE, do jeito que estava.
  const trialAfter = byId.get('trial-1');
  assert.equal(trialAfter?.status, 'ACTIVE');
  assert.equal(trialAfter?.commercialStatus, 'EXPERIENCIA_ATIVA');
});

test('EM_ABERTO -> PAGO depois do fim do teste: PAID ativa imediatamente e finaliza o TRIAL', async () => {
  const trial = buildTrial();
  const paidContract = buildPendingPaidContract();
  const { tx, byId } = createFakeTx([trial, paidContract]);

  const paymentConfirmedAt = new Date('2026-10-20T09:00:00-03:00'); // depois do fim do teste

  const updated = await activatePaidContractFromTrial(tx, paidContract, paymentConfirmedAt);

  assert.equal(updated.status, 'ACTIVE');
  assert.equal(updated.commercialStatus, 'CONTRATO_ATIVO');
  assert.equal(updated.startDate.getTime(), paymentConfirmedAt.getTime());
  assert.equal(updated.activatedAt?.getTime(), paymentConfirmedAt.getTime());

  const trialAfter = byId.get('trial-1');
  assert.equal(trialAfter?.status, 'FINALIZED');
  assert.equal(trialAfter?.commercialStatus, 'FINALIZADO');
});

test('confirmação PAGO repetida: datas e status já aplicados ficam inalterados (idempotente)', async () => {
  const trial = buildTrial();
  // Contrato já passou pela transição numa confirmação anterior: acceptedAt
  // já setado, startDate/endDate já deslocados para o dia seguinte ao teste.
  const alreadyScheduledStartDate = new Date('2026-10-17T03:00:00.000Z');
  const alreadyScheduledEndDate = new Date('2026-11-16T02:59:59.999Z');
  const firstConfirmedAt = new Date('2026-10-14T09:00:00-03:00');

  const paidContract = buildPendingPaidContract({
    status: 'ACTIVE',
    commercialStatus: 'CONTRATO_PAGO_AGENDADO',
    startDate: alreadyScheduledStartDate,
    endDate: alreadyScheduledEndDate,
    acceptedAt: firstConfirmedAt,
    activatedAt: null,
  });
  const { tx, byId } = createFakeTx([trial, paidContract]);

  // Segunda confirmação do mesmo pagamento, horas depois (ex.: reenvio de
  // webhook ou o gestor confirmando de novo).
  const secondConfirmedAt = new Date('2026-10-14T15:00:00-03:00');

  const updated = await activatePaidContractFromTrial(tx, paidContract, secondConfirmedAt);

  assert.equal(updated.startDate.getTime(), alreadyScheduledStartDate.getTime());
  assert.equal(updated.endDate.getTime(), alreadyScheduledEndDate.getTime());
  assert.equal(updated.status, 'ACTIVE');
  assert.equal(updated.commercialStatus, 'CONTRATO_PAGO_AGENDADO');
  assert.equal(updated.acceptedAt?.getTime(), firstConfirmedAt.getTime());

  // Nenhuma escrita extra deve ter acontecido no contrato nem no TRIAL.
  const paidAfter = byId.get('paid-1');
  assert.equal(paidAfter?.startDate.getTime(), alreadyScheduledStartDate.getTime());
  const trialAfter = byId.get('trial-1');
  assert.equal(trialAfter?.status, 'ACTIVE');
});

// extendMonthlyAccessPeriod: aritmética de mês civil com clamp (revisão —
// nunca Date.setMonth() puro). Casos de borda cobertos em detalhe em
// tests/civil-month.test.ts (o helper central); aqui testamos a função
// exportada de verdade, incluindo o timezone America/Sao_Paulo.
test('extendMonthlyAccessPeriod: caso normal — 14/out + 1 mês = 14/nov', () => {
  const currentEndDate = new Date('2026-10-14T23:59:59.999-03:00');
  const paymentConfirmedAt = new Date('2026-10-10T09:00:00-03:00');

  const result = extendMonthlyAccessPeriod({ currentEndDate, paymentConfirmedAt });
  assert.equal(result.toISOString(), new Date('2026-11-14T23:59:59.999-03:00').toISOString());
});

test('extendMonthlyAccessPeriod: 31/jan + 1 mês clampa para 28/fev (não estoura para março)', () => {
  const currentEndDate = new Date('2026-01-31T23:59:59.999-03:00');
  const paymentConfirmedAt = new Date('2026-01-25T09:00:00-03:00');

  const result = extendMonthlyAccessPeriod({ currentEndDate, paymentConfirmedAt });
  assert.equal(result.toISOString(), new Date('2026-02-28T23:59:59.999-03:00').toISOString());
});

test('extendMonthlyAccessPeriod: 31/mar + 1 mês clampa para 30/abr', () => {
  const currentEndDate = new Date('2026-03-31T23:59:59.999-03:00');
  const paymentConfirmedAt = new Date('2026-03-25T09:00:00-03:00');

  const result = extendMonthlyAccessPeriod({ currentEndDate, paymentConfirmedAt });
  assert.equal(result.toISOString(), new Date('2026-04-30T23:59:59.999-03:00').toISOString());
});

test('extendMonthlyAccessPeriod: 29/fev de ano bissexto + 1 mês = 29/mar (março comporta o dia 29)', () => {
  const currentEndDate = new Date('2028-02-29T23:59:59.999-03:00');
  const paymentConfirmedAt = new Date('2028-02-25T09:00:00-03:00');

  const result = extendMonthlyAccessPeriod({ currentEndDate, paymentConfirmedAt });
  assert.equal(result.toISOString(), new Date('2028-03-29T23:59:59.999-03:00').toISOString());
});

test('extendMonthlyAccessPeriod: renovações mensais encadeadas depois de um clamp mantêm o dia clampado (28), não tentam voltar a 31', () => {
  let endDate = new Date('2026-01-31T23:59:59.999-03:00');

  endDate = extendMonthlyAccessPeriod({ currentEndDate: endDate, paymentConfirmedAt: new Date('2026-01-25T09:00:00-03:00') });
  assert.equal(endDate.toISOString(), new Date('2026-02-28T23:59:59.999-03:00').toISOString());

  endDate = extendMonthlyAccessPeriod({ currentEndDate: endDate, paymentConfirmedAt: new Date('2026-02-25T09:00:00-03:00') });
  assert.equal(endDate.toISOString(), new Date('2026-03-28T23:59:59.999-03:00').toISOString());

  endDate = extendMonthlyAccessPeriod({ currentEndDate: endDate, paymentConfirmedAt: new Date('2026-03-25T09:00:00-03:00') });
  assert.equal(endDate.toISOString(), new Date('2026-04-28T23:59:59.999-03:00').toISOString());
});

test('extendMonthlyAccessPeriod: pagamento atrasado (depois do vencimento) conta o mês a partir da confirmação, não do endDate vencido', () => {
  const currentEndDate = new Date('2026-01-31T23:59:59.999-03:00');
  const paymentConfirmedAt = new Date('2026-02-10T09:00:00-03:00'); // depois do vencimento

  const result = extendMonthlyAccessPeriod({ currentEndDate, paymentConfirmedAt });
  assert.equal(result.toISOString(), new Date('2026-03-10T23:59:59.999-03:00').toISOString());
});
