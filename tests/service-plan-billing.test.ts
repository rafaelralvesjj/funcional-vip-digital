import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveBillingOptions,
  getRecommendedBillingOption,
  formatBillingOptionLabel,
} from '../lib/service-plan-billing.ts';

const monthly = { billingCycle: 'MONTHLY' as const, amountCents: 990, active: true, recommended: false };
const annual = { billingCycle: 'ANNUAL' as const, amountCents: 9990, active: true, recommended: true };
const inactiveLegacy = { billingCycle: 'MONTHLY' as const, amountCents: 5900, active: false, recommended: false };

test('ignora opções de cobrança inativas', () => {
  const active = getActiveBillingOptions([monthly, annual, inactiveLegacy]);
  assert.equal(active.length, 2);
  assert.ok(!active.some((option) => option.amountCents === 5900));
});

test('recomenda a opção marcada como recommended quando existir', () => {
  const recommended = getRecommendedBillingOption([monthly, annual]);
  assert.equal(recommended?.billingCycle, 'ANNUAL');
});

test('cai para ANNUAL quando nenhuma opção está marcada como recommended', () => {
  const noFlag = [
    { ...monthly, recommended: false },
    { ...annual, recommended: false },
  ];
  const recommended = getRecommendedBillingOption(noFlag);
  assert.equal(recommended?.billingCycle, 'ANNUAL');
});

test('retorna null quando não há opção ativa', () => {
  assert.equal(getRecommendedBillingOption([inactiveLegacy]), null);
  assert.equal(getRecommendedBillingOption([]), null);
  assert.equal(getRecommendedBillingOption(null), null);
});

test('formata mensal e anual no padrão R$ X,XX/mês ou /ano', () => {
  assert.equal(formatBillingOptionLabel(monthly), 'R$ 9,90/mês');
  assert.equal(formatBillingOptionLabel(annual), 'R$ 99,90/ano');
});
