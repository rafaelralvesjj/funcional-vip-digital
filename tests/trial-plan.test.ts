import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrialPlan,
  isTrialPlanCompatibleWithCurrentOffer,
  TrialPlanNotConfiguredError,
  TrialPlanIncompatibleError,
  TRIAL_OFFER_WORKOUTS_PER_WEEK,
} from '../lib/trial-plan.ts';

const compatiblePlan = { id: 'plan-1', name: 'Funcional UP — 3x/semana', allowTrial: true, active: true, workoutsPerWeek: 3 };
const legacyPlan = { id: 'plan-old', name: 'Experiência antiga 2x', allowTrial: true, active: true, workoutsPerWeek: 2 };

test('TRIAL_OFFER_WORKOUTS_PER_WEEK é 3 (oferta comercial atual)', () => {
  assert.equal(TRIAL_OFFER_WORKOUTS_PER_WEEK, 3);
});

test('isTrialPlanCompatibleWithCurrentOffer rejeita plano antigo de 2x/semana mesmo com allowTrial=true e active=true', () => {
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(legacyPlan), false);
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(compatiblePlan), true);
  assert.equal(isTrialPlanCompatibleWithCurrentOffer(null), false);
});

test('selectTrialPlan escolhe o plano compatível quando ele é o único', () => {
  assert.equal(selectTrialPlan([compatiblePlan]), compatiblePlan);
});

test('selectTrialPlan lança TrialPlanNotConfiguredError quando não há nenhum plano de teste ativo', () => {
  assert.throws(() => selectTrialPlan([]), TrialPlanNotConfiguredError);
  assert.throws(() => selectTrialPlan(null), TrialPlanNotConfiguredError);
  assert.throws(() => selectTrialPlan(undefined), TrialPlanNotConfiguredError);
});

test('TrialPlanNotConfiguredError tem mensagem operacional, não genérica', () => {
  try {
    selectTrialPlan([]);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof TrialPlanNotConfiguredError);
    assert.match((error as Error).message, /allowTrial=true/);
    assert.match((error as Error).message, /active=true/);
  }
});

test('selectTrialPlan lança TrialPlanIncompatibleError quando só existe plano antigo incompatível', () => {
  assert.throws(() => selectTrialPlan([legacyPlan]), TrialPlanIncompatibleError);
});

test('TrialPlanIncompatibleError explica o motivo (frequência do plano vs. oferta atual) de forma operacional', () => {
  try {
    selectTrialPlan([legacyPlan]);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof TrialPlanIncompatibleError);
    assert.match((error as Error).message, /Experiência antiga 2x/);
    assert.match((error as Error).message, /2 treino\(s\) por semana/);
    assert.match((error as Error).message, /3x por semana/);
  }
});

// Caso importante sinalizado na revisão: um plano antigo de 2x/semana
// coexistindo com o plano novo de 3x/semana (ex.: o antigo nunca foi
// desativado) não pode fazer o cadastro falhar. selectTrialPlan precisa
// escolher o compatível entre TODOS os planos recebidos, não validar
// apenas o primeiro por ordem de sortOrder/createdAt.
test('plano antigo 2x + plano novo 3x coexistindo: seleciona o 3x, não lança erro', () => {
  const selecionado = selectTrialPlan([legacyPlan, compatiblePlan]);
  assert.equal(selecionado, compatiblePlan);
});

test('mesmo com o plano antigo 2x listado primeiro (prioridade de sortOrder/createdAt), seleciona o 3x', () => {
  // Simula a ordem que viria do banco (sortOrder/createdAt) com o plano
  // antigo tendo prioridade maior — não deve bastar ordem para decidir.
  const planosNaOrdemDoBanco = [legacyPlan, compatiblePlan];
  assert.equal(selectTrialPlan(planosNaOrdemDoBanco), compatiblePlan);
});

test('com o plano novo 3x listado primeiro, também seleciona o 3x (ordem não importa para a escolha)', () => {
  const planosNaOrdemDoBanco = [compatiblePlan, legacyPlan];
  assert.equal(selectTrialPlan(planosNaOrdemDoBanco), compatiblePlan);
});

test('dois planos antigos incompatíveis (nenhum 3x): lança TrialPlanIncompatibleError citando o primeiro', () => {
  const outroLegado = { id: 'plan-old-2', name: 'Experiência antiga 5x', allowTrial: true, active: true, workoutsPerWeek: 5 };
  try {
    selectTrialPlan([legacyPlan, outroLegado]);
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof TrialPlanIncompatibleError);
    assert.match((error as Error).message, /Experiência antiga 2x/);
  }
});
