import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getActiveBillingOptions,
  getRecommendedBillingOption,
  formatBillingOptionLabel,
  hasDuplicateBillingCycle,
  assertNoDuplicateBillingCycle,
  hasAtMostOneRecommendedActiveOption,
  assertAtMostOneRecommendedActiveOption,
  withExclusiveRecommendedOption,
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

test('detecta duas opções com o mesmo billingCycle no mesmo plano', () => {
  assert.equal(hasDuplicateBillingCycle([monthly, annual]), false);
  assert.equal(hasDuplicateBillingCycle([monthly, { ...monthly, amountCents: 1200 }]), true);
});

test('assertNoDuplicateBillingCycle só lança quando há duplicidade', () => {
  assert.doesNotThrow(() => assertNoDuplicateBillingCycle([monthly, annual]));
  assert.throws(
    () => assertNoDuplicateBillingCycle([monthly, { ...monthly, amountCents: 1200 }]),
    /mesmo billingCycle/
  );
});

test('a migration cria unique index para (service_plan_id, billing_cycle)', () => {
  const migrationPath = fileURLToPath(
    new URL(
      '../prisma/migrations/20261009130000_service_plan_billing_options/migration.sql',
      import.meta.url
    )
  );
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(
    sql,
    /CREATE UNIQUE INDEX[^;]*"service_plan_id",\s*"billing_cycle"/i
  );
});

test('permite no máximo uma opção ativa recomendada por plano', () => {
  assert.equal(hasAtMostOneRecommendedActiveOption([monthly, annual]), true);

  const doisRecomendados = [monthly, annual].map((option) => ({ ...option, recommended: true }));
  assert.equal(hasAtMostOneRecommendedActiveOption(doisRecomendados), false);
});

test('opção recomendada mas inativa não conta para a regra de exclusividade', () => {
  const inativaRecomendada = { ...monthly, active: false, recommended: true };
  assert.equal(hasAtMostOneRecommendedActiveOption([inativaRecomendada, annual]), true);
});

test('assertAtMostOneRecommendedActiveOption só lança quando há mais de uma recomendada ativa', () => {
  assert.doesNotThrow(() => assertAtMostOneRecommendedActiveOption([monthly, annual]));

  const doisRecomendados = [monthly, annual].map((option) => ({ ...option, recommended: true }));
  assert.throws(
    () => assertAtMostOneRecommendedActiveOption(doisRecomendados),
    /uma opção de cobrança recomendada ativa/
  );
});

test('withExclusiveRecommendedOption marca só o id escolhido como recommended', () => {
  const comId = [
    { ...monthly, id: 'opt-monthly', recommended: true },
    { ...annual, id: 'opt-annual', recommended: false },
  ];

  const resultado = withExclusiveRecommendedOption(comId, 'opt-annual');

  assert.equal(resultado.find((o) => o.id === 'opt-monthly')?.recommended, false);
  assert.equal(resultado.find((o) => o.id === 'opt-annual')?.recommended, true);
  assert.equal(hasAtMostOneRecommendedActiveOption(resultado), true);
});
