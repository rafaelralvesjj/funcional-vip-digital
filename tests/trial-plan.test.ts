import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTrialPlanConfigured,
  isTrialPlanCompatibleWithCurrentOffer,
  TrialPlanNotConfiguredError,
  TrialPlanIncompatibleError,
  TRIAL_OFFER_WORKOUTS_PER_WEEK,
} from '../lib/trial-plan.ts';

const compatiblePlan = { id: 'plan-1', name: 'Funcional UP — 3x/semana', allowTrial: true, active: true, workoutsPerWeek: 3 };
const legacyPlan = { id: 'plan-old', name: 'Experiência antiga 2x', allowTrial: true, active: true, workoutsPerWeek: 2 };

test('assertTrialPlanConfigured devolve o plano quando ele existe e é compatível com a oferta atual (3x/semana)', () => {
  assert.equal(assertTrialPlanConfigured(compatiblePlan), compatiblePlan);
});

test('assertTrialPlanConfigured lança erro operacional claro quando não há plano, em vez de criar um automaticamente', () => {
  assert.throws(() => assertTrialPlanConfigured(null), TrialPlanNotConfiguredError);
  assert.throws(() => assertTrialPlanConfigured(undefined), TrialPlanNotConfiguredError);
});

test('TrialPlanNotConfiguredError tem mensagem operacional, não genérica', () => {
  try {
    assertTrialPlanConfigured(null);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof TrialPlanNotConfiguredError);
    assert.match((error as Error).message, /allowTrial=true/);
    assert.match((error as Error).message, /active=true/);
  }
});

test('TRIAL_OFFER_WORKOUTS_PER_WEEK é 3 (oferta comercial atual)', () => {
  assert.equal(TRIAL_OFFER_WORKOUTS_PER_WEEK, 3);
});

test('isTrialPlanCompatibleWithCurrentOffer rejeita plano antigo de 2x/semana mesmo com allowTrial=true e active=true', () => {
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(legacyPlan), false);
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(compatiblePlan), true);
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(null), false);
});

test('assertTrialPlanConfigured nunca cadastra silenciosamente com um ServicePlan antigo incompatível (2x/semana)', () => {
  assert.throws(() => assertTrialPlanConfigured(legacyPlan), TrialPlanIncompatibleError);
});

test('TrialPlanIncompatibleError explica o motivo (frequência do plano vs. oferta atual) de forma operacional', () => {
  try {
    assertTrialPlanConfigured(legacyPlan);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof TrialPlanIncompatibleError);
    assert.match((error as Error).message, /Experiência antiga 2x/);
    assert.match((error as Error).message, /2 treino\(s\) por semana/);
    assert.match((error as Error).message, /3x por semana/);
  }
});
