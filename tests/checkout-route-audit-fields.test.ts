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
    ...['createAsaasCustomer(', 'createAsaasPayment(', 'createAsaasSubscription(']
      .map((needle) => source.indexOf(needle))
      .filter((index) => index !== -1)
  );

  assert.ok(reserveIndex !== -1, 'esperava uma chamada a reserveCheckoutSlot');
  assert.ok(reserveIndex < firstAsaasCallIndex, 'a reserva local precisa vir antes da primeira chamada à Asaas');
});

test('checkout compensa (remove a reserva) quando a chamada à Asaas falha', () => {
  const source = readRouteSource();
  assert.match(source, /studentContract\.delete/);
  assert.match(source, /contractPayment\.deleteMany/);
});
