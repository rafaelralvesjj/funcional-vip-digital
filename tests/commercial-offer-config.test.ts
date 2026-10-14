import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_OFFER_NAME,
  COMMERCIAL_OFFER_WORKOUTS_PER_WEEK,
  COMMERCIAL_OFFER_TRIAL_DAYS,
  COMMERCIAL_OFFER_MONTHLY_PRICE_CENTS,
  COMMERCIAL_OFFER_ANNUAL_PRICE_CENTS,
  COMMERCIAL_OFFER_ANNUAL_RECOMMENDED,
  formatCommercialOfferMonthlyPrice,
  formatCommercialOfferAnnualPrice,
} from '../lib/commercial-offer-config.ts';
import { TRIAL_OFFER_WORKOUTS_PER_WEEK } from '../lib/trial-plan.ts';
import { TRIAL_DURATION_DAYS } from '../lib/trial-window.ts';

test('a oferta comercial compartilhada reaproveita as constantes de negócio existentes, não duplica', () => {
  assert.equal(COMMERCIAL_OFFER_WORKOUTS_PER_WEEK, TRIAL_OFFER_WORKOUTS_PER_WEEK);
  assert.equal(COMMERCIAL_OFFER_TRIAL_DAYS, TRIAL_DURATION_DAYS);
});

test('a oferta é a atual: 3 treinos/semana, 7 dias de teste, mensal R$9,90, anual R$99,90 recomendado', () => {
  assert.equal(COMMERCIAL_OFFER_WORKOUTS_PER_WEEK, 3);
  assert.equal(COMMERCIAL_OFFER_TRIAL_DAYS, 7);
  assert.equal(COMMERCIAL_OFFER_MONTHLY_PRICE_CENTS, 990);
  assert.equal(COMMERCIAL_OFFER_ANNUAL_PRICE_CENTS, 9990);
  assert.equal(COMMERCIAL_OFFER_ANNUAL_RECOMMENDED, true);
  assert.match(COMMERCIAL_OFFER_NAME, /3 treinos/);
});

test('formatCommercialOfferMonthlyPrice/AnnualPrice formatam em pt-BR sem o prefixo R$', () => {
  assert.equal(formatCommercialOfferMonthlyPrice(), '9,90');
  assert.equal(formatCommercialOfferAnnualPrice(), '99,90');
});
