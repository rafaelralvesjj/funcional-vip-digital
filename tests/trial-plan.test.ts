import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrialPlanConfigured, TrialPlanNotConfiguredError } from '../lib/trial-plan.ts';

test('assertTrialPlanConfigured devolve o plano quando ele existe', () => {
  const plan = { id: 'plan-1', allowTrial: true, active: true };
  assert.equal(assertTrialPlanConfigured(plan), plan);
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
