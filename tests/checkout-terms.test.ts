import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTermsAccepted,
  TermsNotAcceptedError,
  CHECKOUT_TERMS_VERSION,
} from '../lib/checkout-terms.ts';

test('assertTermsAccepted lança TermsNotAcceptedError quando não é true', () => {
  assert.throws(() => assertTermsAccepted(false), TermsNotAcceptedError);
  assert.throws(() => assertTermsAccepted(undefined), TermsNotAcceptedError);
  assert.throws(() => assertTermsAccepted('true'), TermsNotAcceptedError);
  assert.throws(() => assertTermsAccepted(1), TermsNotAcceptedError);
});

test('assertTermsAccepted não lança quando acceptedTerms é exatamente true', () => {
  assert.doesNotThrow(() => assertTermsAccepted(true));
});

test('CHECKOUT_TERMS_VERSION é uma constante não vazia, sem texto jurídico embutido', () => {
  assert.equal(typeof CHECKOUT_TERMS_VERSION, 'string');
  assert.ok(CHECKOUT_TERMS_VERSION.length > 0);
});
