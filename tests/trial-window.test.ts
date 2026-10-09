import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrialWindow,
  getTrialDaysRemaining,
  isTrialWindowExpired,
  isTrialWorkoutCapReached,
  shouldShowContractCta,
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
