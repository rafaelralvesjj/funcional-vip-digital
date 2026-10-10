import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCurrentContract,
  hasContractStarted,
  computeShowContractCta,
  computeShowCombinedWorkoutCta,
} from '../lib/student-dashboard-summary.ts';
import { getSaoPauloCivilDateInput } from '../lib/planning-window.ts';

/**
 * REVISÃO: hasContractStarted/pickCurrentContract comparam instantes reais
 * (new Date(startDate).getTime() <= referenceDate.getTime()), sem nenhum
 * truncamento de "dia" em fuso nenhum — nem do host, nem de São Paulo. Este
 * helper reflete isso: desloca a partir do instante exato de "agora", nunca
 * normalizando para meio-dia ou meia-noite de fuso nenhum, para não
 * reintroduzir por acidente uma noção de "dia" que a produção não tem mais.
 */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * computeShowContractCta, por outro lado, compara datas CIVIS de São Paulo
 * (ver shouldShowContractCta/getTrialDaysRemaining em lib/trial-window.ts) —
 * um fuso diferente do de daysFromNow acima. Usar daysFromNow (fuso do host)
 * para testar essa função específica é incorreto durante a janela em que o
 * dia civil de São Paulo ainda é "ontem" em relação ao UTC (00:00–03:00
 * UTC) — gera um teste "flaky" sem nenhum bug real na produção. Este helper
 * separado usa o mesmo fuso que a função testada.
 */
function saoPauloDaysFromNow(days: number): Date {
  const todayCivilDate = getSaoPauloCivilDateInput(new Date());
  const anchor = new Date(`${todayCivilDate}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  const targetCivilDate = anchor.toISOString().slice(0, 10);
  return new Date(`${targetCivilDate}T12:00:00-03:00`);
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

// REVISÃO: hasContractStarted/isTrialActiveAndValid/pickCurrentContract não
// podem depender do fuso do host (startOfDay/setHours) — startDate/endDate
// são instantes reais. Cenário exato pedido: TRIAL termina
// 2026-10-09T23:59:59.999-03:00; PAID AWAITING_PAYMENT começa
// 2026-10-10T00:00:00-03:00 (1ms depois, sem gap nem sobreposição). Em
// 2026-10-10T02:59:59.999Z (mesmo instante do fim do trial) o trial ainda
// prevalece; em 2026-10-10T03:00:00Z (1ms depois) o trial já expirou e o
// PAID pendente deve virar o contrato atual (AGUARDANDO_PAGAMENTO).
test('REVISÃO: trial termina 23:59:59.999-03:00 e PAID AWAITING_PAYMENT começa no instante seguinte — seleção muda exatamente no limite, sem depender do fuso do host', () => {
  const trial = {
    id: 'trial-1',
    type: 'TRIAL',
    status: 'ACTIVE',
    startDate: new Date('2026-10-01T00:00:00-03:00'),
    endDate: new Date('2026-10-09T23:59:59.999-03:00'),
  };

  const paidPendente = {
    id: 'paid-pendente',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    startDate: new Date('2026-10-10T00:00:00-03:00'),
    endDate: new Date('2026-11-09T23:59:59.999-03:00'),
  };

  const instanteFimDoTrial = new Date('2026-10-10T02:59:59.999Z'); // == 2026-10-09T23:59:59.999-03:00
  const instanteAposFimDoTrial = new Date('2026-10-10T03:00:00Z'); // 1ms depois

  const atualAntes = pickCurrentContract([trial, paidPendente], null, instanteFimDoTrial);
  assert.equal(atualAntes?.id, 'trial-1');

  const atualDepois = pickCurrentContract([trial, paidPendente], null, instanteAposFimDoTrial);
  assert.equal(atualDepois?.id, 'paid-pendente');
});

// computeShowContractCta: CTA "Contratar plano" (Fase 3).
test('CTA não aparece quando faltam mais de 2 dias para o fim do teste', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: saoPauloDaysFromNow(-1),
      endDate: saoPauloDaysFromNow(6),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA aparece a partir de 2 dias antes do fim do teste', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: saoPauloDaysFromNow(-5),
      endDate: saoPauloDaysFromNow(2),
    },
  ];

  assert.equal(computeShowContractCta(contracts), true);
});

test('CTA continua aparecendo depois que o teste expira, sem contrato pago', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: saoPauloDaysFromNow(-10),
      endDate: saoPauloDaysFromNow(-3),
    },
  ];

  assert.equal(computeShowContractCta(contracts), true);
});

test('CTA some quando já existe um PAID ativo', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'FINALIZED',
      startDate: saoPauloDaysFromNow(-10),
      endDate: saoPauloDaysFromNow(-3),
    },
    {
      type: 'PAID',
      status: 'ACTIVE',
      startDate: saoPauloDaysFromNow(-2),
      endDate: saoPauloDaysFromNow(28),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA some quando já existe um PAID agendado (AWAITING_PAYMENT ou ACTIVE futuro)', () => {
  const contracts = [
    {
      type: 'TRIAL',
      status: 'ACTIVE',
      startDate: saoPauloDaysFromNow(-6),
      endDate: saoPauloDaysFromNow(1),
    },
    {
      type: 'PAID',
      status: 'AWAITING_PAYMENT',
      startDate: saoPauloDaysFromNow(2),
      endDate: saoPauloDaysFromNow(32),
    },
  ];

  assert.equal(computeShowContractCta(contracts), false);
});

test('CTA é falso quando não há nenhum TRIAL', () => {
  assert.equal(computeShowContractCta([]), false);
  assert.equal(
    computeShowContractCta([
      { type: 'PAID', status: 'FINALIZED', startDate: saoPauloDaysFromNow(-40), endDate: saoPauloDaysFromNow(-10) },
    ]),
    false
  );
});

// computeShowCombinedWorkoutCta: CTA "Experimente um treino combinado".
function daysFromNowExact(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

test('CTA de combinado nunca aparece para quem já está em COMBINADO', () => {
  assert.equal(
    computeShowCombinedWorkoutCta({
      workoutMethodMode: 'COMBINADO',
      firstCompletedWorkoutDate: daysFromNowExact(-90),
    }),
    false
  );
});

test('CTA de combinado não aparece sem nenhum treino concluído', () => {
  assert.equal(
    computeShowCombinedWorkoutCta({
      workoutMethodMode: 'NORMAL',
      firstCompletedWorkoutDate: null,
    }),
    false
  );
});

test('CTA de combinado não aparece com 29 dias desde o primeiro treino concluído', () => {
  assert.equal(
    computeShowCombinedWorkoutCta({
      workoutMethodMode: 'NORMAL',
      firstCompletedWorkoutDate: daysFromNowExact(-29),
    }),
    false
  );
});

test('CTA de combinado aparece com 30 dias desde o primeiro treino concluído', () => {
  assert.equal(
    computeShowCombinedWorkoutCta({
      workoutMethodMode: 'NORMAL',
      firstCompletedWorkoutDate: daysFromNowExact(-30),
    }),
    true
  );
});
