import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrialWindow,
  getTrialDaysRemaining,
  isTrialWindowExpired,
  isTrialWorkoutCapReached,
  shouldShowContractCta,
  formatTrialPeriodSummary,
  resolvePaidContractStart,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_WORKOUTS,
} from '../lib/trial-window.ts';

// Horário fixo em meio-dia UTC evita ambiguidade de fuso ao formatar para
// America/Sao_Paulo (UTC-3), sempre cai no mesmo dia civil.
function saoPauloNoon(dateInput: string): Date {
  return new Date(`${dateInput}T12:00:00Z`);
}

test('cadastro em qualquer dia inicia o teste no mesmo dia civil, nunca adiado', () => {
  const sexta = saoPauloNoon('2026-10-16'); // sexta-feira
  const window = getTrialWindow(sexta);
  assert.equal(window.startCivilDate, '2026-10-16');
});

test('teste dura exatamente 7 dias civis (do exemplo da especificação)', () => {
  const window = getTrialWindow(saoPauloNoon('2026-10-10'));
  assert.equal(window.startCivilDate, '2026-10-10');
  assert.equal(window.endCivilDate, '2026-10-16');
  assert.equal(TRIAL_DURATION_DAYS, 7);
});

test('total do teste é 3 treinos, não reseta por semana', () => {
  assert.equal(TRIAL_MAX_WORKOUTS, 3);
  assert.equal(isTrialWorkoutCapReached(2), false);
  assert.equal(isTrialWorkoutCapReached(3), true);
  assert.equal(isTrialWorkoutCapReached(4), true);
});

test('virada de semana dentro da janela de 7 dias não libera treino extra', () => {
  // Teste de sexta (16/10) a quinta (22/10) atravessa um domingo/segunda;
  // o limite continua sendo o total de 3, não 3 por semana.
  const window = getTrialWindow(saoPauloNoon('2026-10-16'));
  assert.equal(window.endCivilDate, '2026-10-22');
  assert.equal(isTrialWorkoutCapReached(3, window.maxWorkouts), true);
});

test('CTA não aparece com 3 ou mais dias restantes', () => {
  const window = getTrialWindow(saoPauloNoon('2026-10-10')); // termina 16/10
  const tresDiasAntes = saoPauloNoon('2026-10-13');
  assert.equal(getTrialDaysRemaining(window, tresDiasAntes), 3);
  assert.equal(
    shouldShowContractCta({ window, now: tresDiasAntes, hasPaidContractActiveOrScheduled: false }),
    false
  );
});

test('CTA aparece com 2 dias restantes (exemplo: teste termina dia 16, CTA a partir do dia 14)', () => {
  const window = getTrialWindow(saoPauloNoon('2026-10-10'));
  const doisDiasAntes = saoPauloNoon('2026-10-14');
  assert.equal(getTrialDaysRemaining(window, doisDiasAntes), 2);
  assert.equal(
    shouldShowContractCta({ window, now: doisDiasAntes, hasPaidContractActiveOrScheduled: false }),
    true
  );
});

test('CTA permanece visível após a expiração enquanto não houver contrato pago', () => {
  const window = getTrialWindow(saoPauloNoon('2026-10-10'));
  const depoisDeExpirar = saoPauloNoon('2026-10-20');
  assert.equal(isTrialWindowExpired(window, depoisDeExpirar), true);
  assert.equal(getTrialDaysRemaining(window, depoisDeExpirar), 0);
  assert.equal(
    shouldShowContractCta({ window, now: depoisDeExpirar, hasPaidContractActiveOrScheduled: false }),
    true
  );
});

test('CTA não aparece quando já existe contrato pago ativo ou agendado', () => {
  const window = getTrialWindow(saoPauloNoon('2026-10-10'));
  const depoisDeExpirar = saoPauloNoon('2026-10-20');
  assert.equal(
    shouldShowContractCta({ window, now: depoisDeExpirar, hasPaidContractActiveOrScheduled: true }),
    false
  );
});

test('startDate preserva exatamente o instante do cadastro, não o trunca para meio-dia', () => {
  const cadastro = new Date('2026-10-10T12:34:56-03:00');
  const window = getTrialWindow(cadastro);

  assert.equal(window.startDate.getTime(), cadastro.getTime());
  assert.equal(window.startDate.toISOString(), cadastro.toISOString());
});

test('endDate é exatamente 16/10/2026 23:59:59.999 em America/Sao_Paulo, sem depender do fuso do servidor', () => {
  const cadastro = new Date('2026-10-10T12:34:56-03:00');
  const window = getTrialWindow(cadastro);
  const esperado = new Date('2026-10-16T23:59:59.999-03:00');

  assert.equal(window.endCivilDate, '2026-10-16');
  assert.equal(window.endDate.getTime(), esperado.getTime());
  assert.equal(window.endDate.toISOString(), '2026-10-17T02:59:59.999Z');
});

test('instante perto da virada UTC não avança o dia civil indevidamente (01:00Z ainda é 09/10 em SP)', () => {
  const cadastro = new Date('2026-10-10T01:00:00Z'); // 2026-10-09T22:00:00 em America/Sao_Paulo
  const window = getTrialWindow(cadastro);

  assert.equal(window.startCivilDate, '2026-10-09');
  assert.equal(window.endCivilDate, '2026-10-15');
  assert.equal(window.startDate.getTime(), cadastro.getTime());
});

test('cenário E2E 1 — cadastro na sexta-feira: começa na sexta, não pula para segunda', () => {
  const sexta = saoPauloNoon('2026-10-16');
  const window = getTrialWindow(sexta);

  assert.equal(window.startCivilDate, '2026-10-16');
  assert.notEqual(window.startCivilDate, '2026-10-19'); // segunda-feira seguinte
  assert.equal(isTrialWorkoutCapReached(3), true);
});

test('formatTrialPeriodSummary usa o limite real do teste (3), nunca workoutsPerMonth do plano', () => {
  const texto = formatTrialPeriodSummary('16/10/2026');
  assert.equal(texto, 'Seu período de teste vai até 16/10/2026 e inclui até 3 treino(s).');
  assert.doesNotMatch(texto, /ciclo/);
  assert.doesNotMatch(texto, /12/);
});

test('formatTrialPeriodSummary aceita um limite explícito diferente do default', () => {
  const texto = formatTrialPeriodSummary('20/11/2026', 5);
  assert.equal(texto, 'Seu período de teste vai até 20/11/2026 e inclui até 5 treino(s).');
});

// resolvePaidContractStart — exemplo exato da especificação (3.4): teste
// 10/10 a 16/10; pagamento confirmado 14/10; contrato pago começa 17/10.
test('pagamento confirmado durante o teste: contrato pago começa no dia civil seguinte ao fim do teste', () => {
  const window = getTrialWindow(new Date('2026-10-10T12:00:00-03:00'));
  const pagamento = new Date('2026-10-14T09:00:00-03:00');

  const resolucao = resolvePaidContractStart({ trialEndDate: window.endDate, paymentConfirmedAt: pagamento });

  assert.equal(resolucao.paidDuringTrial, true);
  assert.equal(resolucao.startDate.toISOString(), '2026-10-17T03:00:00.000Z');
});

test('os 7 dias de teste continuam valendo integralmente quando o pagamento é antecipado (endDate do teste não muda)', () => {
  const window = getTrialWindow(new Date('2026-10-10T12:00:00-03:00'));
  const pagamento = new Date('2026-10-14T09:00:00-03:00');

  resolvePaidContractStart({ trialEndDate: window.endDate, paymentConfirmedAt: pagamento });

  // A janela do teste em si é imutável — resolvePaidContractStart não a altera.
  assert.equal(window.endCivilDate, '2026-10-16');
  assert.equal(window.endDate.toISOString(), '2026-10-17T02:59:59.999Z');
});

test('pagamento confirmado exatamente no último instante do teste ainda preserva os 7 dias (início no dia seguinte)', () => {
  const window = getTrialWindow(new Date('2026-10-10T12:00:00-03:00'));
  const pagamento = new Date(window.endDate.getTime());

  const resolucao = resolvePaidContractStart({ trialEndDate: window.endDate, paymentConfirmedAt: pagamento });

  assert.equal(resolucao.paidDuringTrial, true);
  assert.equal(resolucao.startDate.toISOString(), '2026-10-17T03:00:00.000Z');
});

test('pagamento confirmado depois de o teste já ter terminado: contrato pago começa na confirmação, não no dia seguinte', () => {
  const window = getTrialWindow(new Date('2026-10-10T12:00:00-03:00'));
  const pagamento = new Date(window.endDate.getTime() + 1); // 1ms depois do fim do teste
  const pagamentoTardio = new Date('2026-10-20T15:30:00-03:00');

  const resolucaoLogoApos = resolvePaidContractStart({ trialEndDate: window.endDate, paymentConfirmedAt: pagamento });
  assert.equal(resolucaoLogoApos.paidDuringTrial, false);
  assert.equal(resolucaoLogoApos.startDate.getTime(), pagamento.getTime());

  const resolucaoTardia = resolvePaidContractStart({ trialEndDate: window.endDate, paymentConfirmedAt: pagamentoTardio });
  assert.equal(resolucaoTardia.paidDuringTrial, false);
  assert.equal(resolucaoTardia.startDate.getTime(), pagamentoTardio.getTime());
});
