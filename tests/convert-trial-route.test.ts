import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mesma limitação de ambiente dos demais testes de rota: sem banco aqui,
// então pinamos por leitura do código-fonte os dois pontos corrigidos após
// a revisão: (1) a rota não pode mais rejeitar um plano só porque
// allowTrial=true — no modelo de oferta única, o mesmo ServicePlan serve
// teste e contratação; (2) a rota passa a aceitar billingOptionId para
// distinguir a cobrança pela ServicePlanBillingOption, não pela flag.
function readRouteSource(): string {
  const path = fileURLToPath(
    new URL('../app/api/student-contracts/convert-trial/route.ts', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

function readFinanceiroPageSource(): string {
  const path = fileURLToPath(
    new URL('../app/dashboard/financeiro/page.tsx', import.meta.url)
  );
  return readFileSync(path, 'utf8');
}

test('convert-trial não rejeita mais planos com allowTrial=true', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /if\s*\(\s*paidPlan\.allowTrial\s*\)/);
});

test('convert-trial distingue a cobrança pela ServicePlanBillingOption (billingOptionId), não pela flag allowTrial', () => {
  const source = readRouteSource();
  assert.match(source, /billingOptionId/);
  assert.match(source, /servicePlanBillingOption\.findUnique/);
});

test('convert-trial continua exigindo que o contrato de origem seja TRIAL ativo (a distinção real de tipo)', () => {
  const source = readRouteSource();
  assert.match(source, /trial\.type\s*!==\s*"TRIAL"/);
  assert.match(source, /type:\s*"PAID"/);
});

test('financeiro: o seletor de plano para conversão não exclui mais planos com allowTrial=true', () => {
  const source = readFinanceiroPageSource();
  assert.doesNotMatch(source, /filter\(\(plan\)\s*=>\s*!plan\.allowTrial/);
});

test('financeiro: usa a regra explícita de elegibilidade (lib/service-plan-eligibility), não um filtro ad-hoc', () => {
  const source = readFinanceiroPageSource();
  assert.match(source, /from ["']@\/lib\/service-plan-eligibility["']/);
  assert.match(source, /filterServicePlansEligibleForPaidContracting\(/);
});

// Preservação dos 7 dias de teste quando o pagamento é antecipado, e a
// transição EM_ABERTO → PAGO em geral, foram centralizadas em
// lib/contract-payment-transition.ts (que por sua vez usa
// resolvePaidContractStart de lib/trial-window.ts) justamente para que o
// futuro webhook do Asaas chame a mesma função em vez de reimplementar a
// regra. Comportamento real é testado em tests/contract-payment-transition.test.ts
// e tests/trial-window.test.ts; aqui só confirmamos que a rota de fato usa
// a função central em vez de decidir status/datas inline.
test('convert-trial usa resolveContractPaymentTransition para decidir a transição EM_ABERTO → PAGO, não decide status/datas inline', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/contract-payment-transition["']/);
  assert.match(source, /resolveContractPaymentTransition\(/);
  assert.doesNotMatch(source, /resolvePaidContractStart\(/);
});

test('convert-trial não finaliza o TRIAL automaticamente quando o pagamento é confirmado durante o teste (paidDuringTrial)', () => {
  const source = readRouteSource();
  assert.match(source, /if\s*\(\s*shouldActivateNow\s*\)\s*\{/);
  assert.match(source, /paidDuringTrial/);
});

test('convert-trial usa um commercialStatus distinto para contrato pago agendado (não confunde com CONTRATO_ATIVO)', () => {
  const source = readRouteSource();
  assert.match(source, /CONTRATO_PAGO_AGENDADO/);
});

test('a transição EM_ABERTO → PAGO é centralizada em lib/contract-payment-transition.ts (reutilizável pelo futuro webhook Asaas)', () => {
  const path = fileURLToPath(
    new URL('../lib/contract-payment-transition.ts', import.meta.url)
  );
  const source = readFileSync(path, 'utf8');
  assert.match(source, /export function resolveContractPaymentTransition/);
  assert.match(source, /from ["']\.\/trial-window["']/);
});
