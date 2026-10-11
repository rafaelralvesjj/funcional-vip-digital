import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Comportamento real (o que fica estruturado vs. só em notes) não é
// testável sem banco neste ambiente; aqui fixamos, por leitura do
// código-fonte, que a rota realmente grava os campos estruturados de
// auditoria pedidos na revisão (item 6) — nunca só em `notes`.
function readRouteSource(): string {
  const path = fileURLToPath(new URL('../app/api/aluno/checkout/route.ts', import.meta.url));
  return readFileSync(path, 'utf8');
}

test('checkout persiste billingOptionId e billingCycle estruturados no contrato, não só em notes', () => {
  const source = readRouteSource();
  assert.match(source, /billingOptionId:\s*billingOption\.id/);
  assert.match(source, /billingCycle:\s*billingOption\.billingCycle/);
});

test('checkout persiste termsVersion e termsAcceptedAt (timestamp do servidor) estruturados', () => {
  const source = readRouteSource();
  assert.match(source, /termsVersion:\s*CHECKOUT_TERMS_VERSION/);
  assert.match(source, /termsAcceptedAt(,|\s*:)/);
  // termsAcceptedAt precisa vir de new Date() no servidor, nunca de um campo
  // recebido no corpo da requisição.
  assert.doesNotMatch(source, /termsAcceptedAt:\s*body/);
});

test('checkout usa reserveCheckoutSlot (trava local) antes de qualquer chamada à Asaas', () => {
  const source = readRouteSource();
  const reserveIndex = source.indexOf('reserveCheckoutSlot(');
  const firstAsaasCallIndex = Math.min(
    ...['createAsaasCustomer(', 'resolveCheckoutCharge(']
      .map((needle) => source.indexOf(needle))
      .filter((index) => index !== -1)
  );

  assert.ok(reserveIndex !== -1, 'esperava uma chamada a reserveCheckoutSlot');
  assert.ok(reserveIndex < firstAsaasCallIndex, 'a reserva local precisa vir antes da primeira chamada à Asaas');
});

// REVISÃO (ponto 1): depois que a reserva local existe, pode já ter havido
// efeito remoto na Asaas (ou o resultado ficou incerto) — a rota nunca pode
// apagar StudentContract/ContractPayment a partir daí. A reserva fica como
// âncora reconciliável (ver lib/checkout-charge.ts) para a próxima
// tentativa, em vez de ser removida.
test('checkout NUNCA apaga a reserva local (StudentContract/ContractPayment) depois de chamar a Asaas', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /studentContract\.delete/);
  assert.doesNotMatch(source, /contractPayment\.deleteMany/);
});

test('checkout usa resolveCheckoutCharge (reconciliação) em vez de chamar createAsaasSubscription/createAsaasPayment diretamente', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/checkout-charge["']/);
  assert.match(source, /resolveCheckoutCharge\(/);
  assert.doesNotMatch(source, /createAsaasSubscription\(/);
  assert.doesNotMatch(source, /createAsaasPayment\(/);
});

test('checkout retoma uma reserva pendente existente (sem link) em vez de reservar de novo', () => {
  const source = readRouteSource();
  assert.match(source, /pendingPayment/);
  assert.match(source, /pendingPaidContract\??\.billingOptionId/);
});

// REVISÃO (ponto 1, terceira rodada): Date.setMonth() não pode mais existir
// nesse arquivo — nem para a duração comercial do placeholder da reserva.
test('checkout não usa mais Date.setMonth() para nenhuma conta de duração comercial', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /setMonth\(/);
  assert.match(source, /from ["']@\/lib\/civil-month["']/);
  assert.match(source, /addCivilMonthsMinusOneDayAsEndOfDay\(/);
});

// REVISÃO (ponto 3, terceira rodada): a busca da reserva AWAITING_PAYMENT
// pendente usa o helper puro e testado de lib/checkout-contract-lookup.ts
// (ver tests/checkout-contract-lookup.test.ts para o comportamento real —
// nunca filtra por endDate), em vez de reimplementar o filtro inline aqui.
test('checkout usa findPendingPaidReservation/findActivePaidContract de lib/checkout-contract-lookup em vez de reimplementar o filtro', () => {
  const source = readRouteSource();
  assert.match(source, /from ["']@\/lib\/checkout-contract-lookup["']/);
  assert.match(source, /findPendingPaidReservation\(/);
  assert.match(source, /findActivePaidContract\(/);
});

// REVISÃO (ponto 1, quinta rodada): findActivePaidContract não pode mais ser
// comparado contra um "hoje" truncado no fuso do host (setHours/startOfDay)
// — só o instante real "agora".
test('checkout não trunca a hora atual (startOfDay/setHours) antes de comparar vigência de contrato', () => {
  const source = readRouteSource();
  assert.doesNotMatch(source, /setHours\(/);
  assert.doesNotMatch(source, /function startOfDay/);
});

// REVISÃO (ponto 2, quinta rodada): a cobrança pendente retomável não pode
// ser só EM_ABERTO — ATRASADO (marcado pelo webhook em PAYMENT_OVERDUE)
// também precisa ser retomável, senão o aluno fica preso em
// CHECKOUT_IN_PROGRESS sem conseguir pagar.
test('checkout usa findResumablePendingPayment (EM_ABERTO ou ATRASADO) em vez de filtrar só por EM_ABERTO', () => {
  const source = readRouteSource();
  assert.match(source, /findResumablePendingPayment\(/);
  assert.doesNotMatch(source, /\.find\(\s*\(?payment\)?\s*=>\s*payment\.status\s*===\s*["']EM_ABERTO["']\s*\)/);
});
