import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveContractCommercialCategory,
  resolveStudentCommercialRow,
  aggregateCommercialStatusCounts,
  formatBillingLabel,
  COMMERCIAL_STATUS_CATEGORIES,
} from '../lib/commercial-status-resolver.ts';
import { getSaoPauloCivilDateInput } from '../lib/planning-window.ts';

/**
 * Ancorado no dia civil de America/Sao_Paulo, não no fuso do host: a
 * contagem de dias de teste (resolveContractCommercialCategory) usa
 * getTrialDaysRemaining, que compara datas civis de São Paulo (ver
 * lib/trial-window.ts). Um daysFromNow baseado em date.setDate() do fuso do
 * host (UTC neste sandbox) fica incorreto durante a janela em que o dia
 * civil de São Paulo ainda é "ontem" em relação ao UTC (00:00–03:00 UTC).
 */
function daysFromNow(days: number): Date {
  const todayCivilDate = getSaoPauloCivilDateInput(new Date());
  const anchor = new Date(`${todayCivilDate}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  const targetCivilDate = anchor.toISOString().slice(0, 10);
  return new Date(`${targetCivilDate}T12:00:00-03:00`);
}

function trial(overrides: Partial<any> = {}) {
  return {
    id: 't1',
    type: 'TRIAL',
    status: 'ACTIVE',
    startDate: daysFromNow(-5),
    endDate: daysFromNow(2),
    priceCents: 0,
    paymentMode: 'GRATUITO',
    billingCycle: null,
    payments: [],
    ...overrides,
  };
}

function paid(overrides: Partial<any> = {}) {
  return {
    id: 'p1',
    type: 'PAID',
    status: 'ACTIVE',
    startDate: daysFromNow(-10),
    endDate: daysFromNow(20),
    priceCents: 9990,
    paymentMode: 'RECORRENTE',
    billingCycle: 'MONTHLY',
    payments: [],
    ...overrides,
  };
}

// --- resolveContractCommercialCategory ---------------------------------

test('TRIAL ACTIVE com mais de 2 dias restantes é EM_TESTE', () => {
  const contract = trial({ endDate: daysFromNow(5) });
  assert.equal(resolveContractCommercialCategory(contract, new Date()), 'EM_TESTE');
});

test('TRIAL ACTIVE com 2 dias ou menos restantes é TESTE_TERMINA_EM_BREVE', () => {
  assert.equal(
    resolveContractCommercialCategory(trial({ endDate: daysFromNow(2) }), new Date()),
    'TESTE_TERMINA_EM_BREVE'
  );
  assert.equal(
    resolveContractCommercialCategory(trial({ endDate: daysFromNow(0) }), new Date()),
    'TESTE_TERMINA_EM_BREVE'
  );
  // já expirado mas ainda ACTIVE (cron não rodou ainda) — continua no bucket
  // de "termina em breve", nunca some do radar da gestão.
  assert.equal(
    resolveContractCommercialCategory(trial({ endDate: daysFromNow(-3) }), new Date()),
    'TESTE_TERMINA_EM_BREVE'
  );
});

test('TRIAL FINALIZED ou CANCELLED é ENCERRADO independentemente do payment', () => {
  assert.equal(resolveContractCommercialCategory(trial({ status: 'FINALIZED' })), 'ENCERRADO');
  assert.equal(resolveContractCommercialCategory(trial({ status: 'CANCELLED' })), 'ENCERRADO');
});

test('PAID AWAITING_PAYMENT com cobrança EM_ABERTO é AGUARDANDO_PAGAMENTO', () => {
  const contract = paid({
    status: 'AWAITING_PAYMENT',
    payments: [{ status: 'EM_ABERTO', dueDate: daysFromNow(3) }],
  });
  assert.equal(resolveContractCommercialCategory(contract), 'AGUARDANDO_PAGAMENTO');
});

test('PAID AWAITING_PAYMENT com cobrança ATRASADO é PAGAMENTO_ATRASADO', () => {
  const contract = paid({
    status: 'AWAITING_PAYMENT',
    payments: [{ status: 'ATRASADO', dueDate: daysFromNow(-2) }],
  });
  assert.equal(resolveContractCommercialCategory(contract), 'PAGAMENTO_ATRASADO');
});

test('PAID ACTIVE sem cobrança atrasada é CONTRATO_ATIVO', () => {
  const contract = paid({ payments: [{ status: 'PAGO', dueDate: daysFromNow(-10) }] });
  assert.equal(resolveContractCommercialCategory(contract), 'CONTRATO_ATIVO');
});

test('PAID ACTIVE com cobrança ATRASADO (ex.: assinatura Asaas com cartão recusado) é PAGAMENTO_ATRASADO', () => {
  const contract = paid({
    payments: [
      { status: 'PAGO', dueDate: daysFromNow(-30) },
      { status: 'ATRASADO', dueDate: daysFromNow(-1) },
    ],
  });
  assert.equal(resolveContractCommercialCategory(contract), 'PAGAMENTO_ATRASADO');
});

test('status SUSPENDED é SUSPENSO mesmo com cobrança ATRASADO presente', () => {
  const contract = paid({ status: 'SUSPENDED', payments: [{ status: 'ATRASADO', dueDate: daysFromNow(-5) }] });
  assert.equal(resolveContractCommercialCategory(contract), 'SUSPENSO');
});

test('status FINALIZED/CANCELLED de um PAID é ENCERRADO, nunca SUSPENSO nem PAGAMENTO_ATRASADO', () => {
  assert.equal(resolveContractCommercialCategory(paid({ status: 'FINALIZED' })), 'ENCERRADO');
  assert.equal(resolveContractCommercialCategory(paid({ status: 'CANCELLED' })), 'ENCERRADO');
});

// --- resolveStudentCommercialRow ----------------------------------------

test('aluno sem nenhum contrato não gera linha (null)', () => {
  assert.equal(resolveStudentCommercialRow({ id: 's1', name: 'Aluno', contracts: [] }), null);
});

test('aluno em teste gera linha com plano/cobrança/próxima data = fim do teste', () => {
  const row = resolveStudentCommercialRow({
    id: 's1',
    name: 'Fulano',
    contracts: [trial({ endDate: daysFromNow(5), plan: { name: 'Plano Trial' } })],
  });

  assert.equal(row?.category, 'EM_TESTE');
  assert.equal(row?.studentId, 's1');
  assert.equal(row?.studentName, 'Fulano');
  assert.equal(row?.planName, 'Plano Trial');
  assert.equal(row?.nextDate?.getTime(), daysFromNow(5).getTime());
});

test('aluno com assinatura mensal Asaas ativa tem Cobrança "Mensal" e próxima data = vencimento da cobrança em aberto', () => {
  const dueDate = daysFromNow(10);
  const row = resolveStudentCommercialRow({
    id: 's2',
    name: 'Ciclana',
    contracts: [
      paid({
        plan: { name: 'Plano Mensal' },
        billingCycle: 'MONTHLY',
        priceCents: 990,
        payments: [{ id: 'pay1', status: 'EM_ABERTO', dueDate }],
      }),
    ],
  });

  assert.equal(row?.category, 'CONTRATO_ATIVO');
  assert.match(row!.billingLabel, /Mensal/);
  assert.match(row!.billingLabel, /9,90/);
  assert.equal(row?.nextDate?.getTime(), dueDate.getTime());
});

test('aluno aguardando pagamento tem próxima data = vencimento da cobrança pendente', () => {
  const dueDate = daysFromNow(1);
  const row = resolveStudentCommercialRow({
    id: 's3',
    name: 'Beltrano',
    contracts: [
      paid({
        status: 'AWAITING_PAYMENT',
        billingCycle: 'ANNUAL',
        priceCents: 9990,
        payments: [{ id: 'pay2', status: 'EM_ABERTO', dueDate }],
      }),
    ],
  });

  assert.equal(row?.category, 'AGUARDANDO_PAGAMENTO');
  assert.match(row!.billingLabel, /Anual/);
  assert.equal(row?.nextDate?.getTime(), dueDate.getTime());
});

test('aluno encerrado tem próxima data = data de finalização (não o endDate do placeholder)', () => {
  const finalizedAt = daysFromNow(-1);
  const row = resolveStudentCommercialRow({
    id: 's4',
    name: 'Ex-aluno',
    contracts: [paid({ status: 'FINALIZED', finalizedAt, endDate: daysFromNow(-1) })],
  });

  assert.equal(row?.category, 'ENCERRADO');
  assert.equal(row?.nextDate?.getTime(), finalizedAt.getTime());
});

test('plano sem nome cai no rótulo genérico "Plano avulso"', () => {
  const row = resolveStudentCommercialRow({
    id: 's5',
    name: 'Sem plano',
    contracts: [paid({ plan: null })],
  });

  assert.equal(row?.planName, 'Plano avulso');
});

// --- formatBillingLabel ---------------------------------------------------

test('formatBillingLabel: TRIAL é sempre "Cortesia (teste)"', () => {
  assert.equal(formatBillingLabel(trial()), 'Cortesia (teste)');
});

test('formatBillingLabel: PAID com billingCycle MONTHLY/ANNUAL usa o rótulo do checkout', () => {
  assert.equal(formatBillingLabel(paid({ billingCycle: 'MONTHLY', priceCents: 990 })), 'Mensal — R$ 9,90');
  assert.equal(formatBillingLabel(paid({ billingCycle: 'ANNUAL', priceCents: 9990 })), 'Anual — R$ 99,90');
});

test('formatBillingLabel: PAID legado (sem billingCycle) usa paymentMode', () => {
  assert.equal(
    formatBillingLabel(paid({ billingCycle: null, paymentMode: 'UNICO', priceCents: 15000 })),
    'Pagamento único — R$ 150,00'
  );
  assert.equal(
    formatBillingLabel(paid({ billingCycle: null, paymentMode: 'RECORRENTE', priceCents: 15000 })),
    'Recorrente — R$ 150,00'
  );
});

// --- aggregateCommercialStatusCounts --------------------------------------

test('aggregateCommercialStatusCounts conta cada categoria e zera as que não aparecem', () => {
  const rows = [
    { category: 'EM_TESTE' },
    { category: 'EM_TESTE' },
    { category: 'CONTRATO_ATIVO' },
  ];

  const counts = aggregateCommercialStatusCounts(rows as any);

  assert.equal(counts.EM_TESTE, 2);
  assert.equal(counts.CONTRATO_ATIVO, 1);
  for (const category of COMMERCIAL_STATUS_CATEGORIES) {
    if (category !== 'EM_TESTE' && category !== 'CONTRATO_ATIVO') {
      assert.equal(counts[category], 0);
    }
  }
});

test('aggregateCommercialStatusCounts com lista vazia devolve todas as categorias zeradas', () => {
  const counts = aggregateCommercialStatusCounts([]);
  for (const category of COMMERCIAL_STATUS_CATEGORIES) {
    assert.equal(counts[category], 0);
  }
});
