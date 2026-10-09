import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutExternalReference,
  isOpaqueCheckoutReference,
} from '../lib/checkout-reference.ts';

test('buildCheckoutExternalReference gera referências opacas e únicas', () => {
  const a = buildCheckoutExternalReference();
  const b = buildCheckoutExternalReference();

  assert.notEqual(a, b);
  assert.ok(isOpaqueCheckoutReference(a));
  assert.ok(isOpaqueCheckoutReference(b));
});

test('isOpaqueCheckoutReference rejeita valores com e-mail, CPF, CNPJ ou espaço (nome)', () => {
  assert.equal(isOpaqueCheckoutReference('chk_fulano@example.com'), false);
  assert.equal(isOpaqueCheckoutReference('chk_123.456.789-00'), false);
  assert.equal(isOpaqueCheckoutReference('chk_12.345.678/0001-90'), false);
  assert.equal(isOpaqueCheckoutReference('chk_Fulano de Tal'), false);
});

test('isOpaqueCheckoutReference rejeita valores sem o prefixo esperado', () => {
  assert.equal(isOpaqueCheckoutReference('abc-123'), false);
});
