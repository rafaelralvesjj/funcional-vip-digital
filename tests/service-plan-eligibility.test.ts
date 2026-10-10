import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isServicePlanEligibleForPaidContracting,
  filterServicePlansEligibleForPaidContracting,
  hasActiveBillingOption,
} from '../lib/service-plan-eligibility.ts';

const trialLegado = {
  id: 'plan-trial-legado',
  name: 'Experiência antiga',
  active: true,
  allowTrial: true,
  billingOptions: [],
};

const pagoLegado = {
  id: 'plan-pago-legado',
  name: 'Plano pago antigo',
  active: true,
  allowTrial: false,
  billingOptions: [],
};

const novoUnico = {
  id: 'plan-novo-unico',
  name: 'Funcional UP — 3 treinos por semana',
  active: true,
  allowTrial: true,
  billingOptions: [
    { billingCycle: 'MONTHLY', active: true },
    { billingCycle: 'ANNUAL', active: true },
  ],
};

test('hasActiveBillingOption é falso para lista vazia ou só com opções inativas', () => {
  assert.equal(hasActiveBillingOption([]), false);
  assert.equal(hasActiveBillingOption(null), false);
  assert.equal(hasActiveBillingOption([{ active: false }]), false);
});

test('hasActiveBillingOption é verdadeiro quando existe ao menos uma opção ativa', () => {
  assert.equal(hasActiveBillingOption([{ active: false }, { active: true }]), true);
});

test('plano antigo só de teste (allowTrial=true, sem BillingOption) nunca é elegível para contratação paga', () => {
  assert.equal(
    isServicePlanEligibleForPaidContracting(trialLegado, trialLegado.billingOptions),
    false
  );
});

test('plano pago antigo (allowTrial=false, sem BillingOption) continua elegível — compatibilidade legada', () => {
  assert.equal(
    isServicePlanEligibleForPaidContracting(pagoLegado, pagoLegado.billingOptions),
    true
  );
});

test('plano novo único (allowTrial=true, com BillingOption ativa) é elegível — modelo novo vale mesmo com allowTrial=true', () => {
  assert.equal(
    isServicePlanEligibleForPaidContracting(novoUnico, novoUnico.billingOptions),
    true
  );
});

test('plano inativo nunca é elegível, mesmo com BillingOption ativa', () => {
  const inativo = { ...novoUnico, active: false };
  assert.equal(isServicePlanEligibleForPaidContracting(inativo, inativo.billingOptions), false);
});

// Cenário central pedido na revisão: trial legado + plano pago legado + novo
// plano único coexistindo → só os dois realmente contratáveis aparecem.
test('trial legado + plano pago legado + novo plano único: só os dois contratáveis aparecem na lista filtrada', () => {
  const elegiveis = filterServicePlansEligibleForPaidContracting([
    trialLegado,
    pagoLegado,
    novoUnico,
  ]);

  const ids = elegiveis.map((plan) => plan.id).sort();
  assert.deepEqual(ids, ['plan-novo-unico', 'plan-pago-legado'].sort());
  assert.equal(elegiveis.some((plan) => plan.id === 'plan-trial-legado'), false);
});
