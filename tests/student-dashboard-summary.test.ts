import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCurrentContract,
  hasContractStarted,
  computeShowContractCta,
} from '../lib/student-dashboard-summary.ts';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

test('hasContractStarted é falso para um startDate no futuro', () => {
  const contrato = { startDate: daysFromNow(3) };
  assert.equal(hasContractStarted(contrato), false);
});

test('hasContractStarted é verdadeiro para um startDate hoje ou no passado', () => {
  assert.equal(hasContractStarted({ startDate: daysFromNow(0) }), true);
  assert.equal(hasContractStarted({ startDate: daysFromNow(-10) }), true);
});

// Caso central da revisão: pagamento antecipado cria um contrato PAID com
// status ACTIVE mas startDate no futuro (dia seguinte ao fim do teste).
// pickCurrentContract NUNCA pode devolver esse contrato antes da hora — o
// TRIAL ainda válido precisa continuar sendo o contrato "atual".
test('contrato PAID futuro (ACTIVE, startDate no futuro) não é tratado como contrato atual: o TRIAL ainda válido prevalece', () => {
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    startDate: daysFromNow(-5),
    endDate: daysFromNow(2), // teste ainda válido por mais 2 dias
  };

  const paidFuturo = {
    id: 'paid-futuro',
    type: 'PAID',
    status: 'ACTIVE', // pago confirmado, mas ainda não começou
    startDate: daysFromNow(3), // dia seguinte ao fim do teste
    endDate: daysFromNow(33),
  };

  const atual = pickCurrentContract([trial, paidFuturo]);

  assert.equal(atual?.id, 'trial-1');
});

test('assim que o startDate do contrato PAID chega, ele passa a ser o contrato atual', () => {
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    startDate: daysFromNow(-7),
    endDate: daysFromNow(-1), // teste já terminou
  };

  const paidIniciado = {
    id: 'paid-iniciado',
    type: 'PAID',
    status: 'ACTIVE',
    startDate: daysFromNow(0), // começa hoje
    endDate: daysFromNow(30),
  };

  const atual = pickCurrentContract([trial, paidIniciado]);

  assert.equal(atual?.id, 'paid-iniciado');
});

test('pagamento tardio (contrato PAID começa imediatamente) também é selecionado como atual de imediato', () => {
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'FINALIZED',
    startDate: daysFromNow(-20),
    endDate: daysFromNow(-13),
  };

  const paidImediato = {
    id: 'paid-imediato',
    type: 'PAID',
    status: 'ACTIVE',
    startDate: daysFromNow(0),
    endDate: daysFromNow(30),
  };

  const atual = pickCurrentContract([trial, paidImediato]);

  assert.equal(atual?.id, 'paid-imediato');
});

// Caso pedido na revisão: o gestor pode criar o contrato PAID com pagamento
// ainda EM_ABERTO (AWAITING_PAYMENT) enquanto o aluno está em teste. Isso
// não pode fazer o aluno ver "aguardando pagamento" com o teste ainda
// rolando — o TRIAL válido continua sendo o contrato atual até terminar.
test('TRIAL válido + PAID AWAITING_PAYMENT: o TRIAL continua sendo o contrato atual', () => {
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    startDate: daysFromNow(-5),
    endDate: daysFromNow(2), // teste ainda válido por mais 2 dias
  };

  const paidAguardandoPagamento = {
    id: 'paid-pendente',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    startDate: daysFromNow(-1), // já "começaria" hoje, mas o pagamento não foi confirmado
    endDate: daysFromNow(29),
  };

  const atual = pickCurrentContract([paidAguardandoPagamento, trial]);

  assert.equal(atual?.id, 'trial-1');
});

test('depois que o TRIAL termina, o PAID AWAITING_PAYMENT passa a ser o contrato atual (AGUARDANDO_PAGAMENTO)', () => {
  const trialExpirado = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'ACTIVE', // ainda não processado pelo cron, mas já expirou
    startDate: daysFromNow(-10),
    endDate: daysFromNow(-3),
  };

  const paidAguardandoPagamento = {
    id: 'paid-pendente',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    startDate: daysFromNow(-1),
    endDate: daysFromNow(29),
  };

  const atual = pickCurrentContract([paidAguardandoPagamento, trialExpirado]);

  assert.equal(atual?.id, 'paid-pendente');
});

test('um contrato PAID futuro não esconde um TRIAL que já expirou quando não há mais nenhum contrato vigente', () => {
  // Caso de borda: TRIAL expirado e PAID ainda não começou. Nenhum dos
  // dois está "em vigor agora" — pickCurrentContract cai no fallback
  // (primeiro contrato da lista), não deve estourar nem escolher o futuro.
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'FINALIZED',
    startDate: daysFromNow(-10),
    endDate: daysFromNow(-3),
  };

  const paidFuturo = {
    id: 'paid-futuro',
    type: 'PAID',
    status: 'ACTIVE',
    startDate: daysFromNow(1),
    endDate: daysFromNow(31),
  };

  const atual = pickCurrentContract([trial, paidFuturo]);

  // Nenhum dos dois está realmente em vigor; o importante aqui é que o
  // contrato futuro nunca seja escolhido como "atual" antes de começar.
  assert.notEqual(atual?.id, 'paid-futuro');
  assert.equal(atual?.id, 'trial-1');
});

// computeShowContractCta: CTA "Contratar plano" (Fase 3).
test('CTA não aparece quando faltam mais de 2 dias para o fim do teste', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: daysFromNow(-1),
      endDate: daysFromNow(6),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA aparece a partir de 2 dias antes do fim do teste', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: daysFromNow(-5),
      endDate: daysFromNow(2),
    },
  ];

  assert.equal(computeShowContractCta(contracts), true);
});

test('CTA continua aparecendo depois que o teste expira, sem contrato pago', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: daysFromNow(-10),
      endDate: daysFromNow(-3),
    },
  ];

  assert.equal(computeShowContractCta(contracts), true);
});

test('CTA some quando já existe um PAID ativo', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'FINALIZED',
      startDate: daysFromNow(-10),
      endDate: daysFromNow(-3),
    },
    {
      type: 'PAID',
      status: 'ACTIVE',
      startDate: daysFromNow(-2),
      endDate: daysFromNow(28),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA some quando já existe um PAID agendado (AWAITING_PAYMENT ou ACTIVE futuro)', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: daysFromNow(-6),
      endDate: daysFromNow(1),
    },
    {
      type: 'PAID',
      status: 'AWAITING_PAYMENT',
      startDate: daysFromNow(2),
      endDate: daysFromNow(32),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA é falso quando não há nenhum TRIAL', () => {
  assert.equal(computeShowContractCta([]), false);
  assert.equal(
    computeShowContractCta([
      { type: 'PAID', status: 'FINALIZED', startDate: daysFromNow(-40), endDate: daysFromNow(-10) },
    ]),
    false
  );
});
