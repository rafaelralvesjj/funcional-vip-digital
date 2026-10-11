import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCivilMonthsClamped,
  addCivilMonthsAsEndOfDay,
  addCivilMonthsMinusOneDayAsEndOfDay,
} from '../lib/civil-month.ts';

test('addCivilMonthsClamped: caso normal (dia existe no mês de destino) soma sem clamp', () => {
  assert.equal(addCivilMonthsClamped('2026-01-01', 1), '2026-02-01');
  assert.equal(addCivilMonthsClamped('2026-06-15', 3), '2026-09-15');
});

test('addCivilMonthsClamped: 31/jan + 1 mês clampa para 28/fev (2026 não é bissexto)', () => {
  assert.equal(addCivilMonthsClamped('2026-01-31', 1), '2026-02-28');
});

test('addCivilMonthsClamped: 31/mar + 1 mês clampa para 30/abr (abril tem 30 dias)', () => {
  assert.equal(addCivilMonthsClamped('2026-03-31', 1), '2026-04-30');
});

test('addCivilMonthsClamped: 29/fev de ano bissexto + 12 meses clampa para 28/fev do ano seguinte (não bissexto)', () => {
  // 2028 é bissexto (divisível por 4, não por 100); 2029 não é.
  assert.equal(addCivilMonthsClamped('2028-02-29', 12), '2029-02-28');
});

test('addCivilMonthsClamped: 29/fev de ano bissexto + 48 meses cai em outro ano bissexto, sem clamp', () => {
  // 2028 -> 2032, ambos bissextos.
  assert.equal(addCivilMonthsClamped('2028-02-29', 48), '2032-02-29');
});

test('addCivilMonthsClamped: nunca "rola" para o mês seguinte ao de destino (bug do Date.setMonth puro)', () => {
  // Date.setMonth ingênuo faria 31/jan virar 3/mar (fevereiro tem 28 dias em
  // 2026: 31-28=3 de overflow). O resultado correto nunca passa de fevereiro.
  const result = addCivilMonthsClamped('2026-01-31', 1);
  assert.ok(result.startsWith('2026-02'), `esperava cair em fevereiro, veio ${result}`);
});

test('addCivilMonthsAsEndOfDay: devolve o fim do dia civil de destino em America/Sao_Paulo (-03:00)', () => {
  const result = addCivilMonthsAsEndOfDay(new Date('2026-01-31T12:00:00-03:00'), 1);
  assert.equal(result.toISOString(), '2026-03-01T02:59:59.999Z'); // 2026-02-28T23:59:59.999-03:00
});

test('addCivilMonthsMinusOneDayAsEndOfDay: caso normal — 1/jan + 1 mês - 1 dia = 31/jan (mês inteiro)', () => {
  const result = addCivilMonthsMinusOneDayAsEndOfDay(new Date('2026-01-01T12:00:00-03:00'), 1);
  const expected = new Date('2026-01-31T23:59:59.999-03:00');
  assert.equal(result.toISOString(), expected.toISOString());
});

test('addCivilMonthsMinusOneDayAsEndOfDay: 31/jan + 1 mês - 1 dia = 27/fev (clamp em 28/fev, menos um dia)', () => {
  const result = addCivilMonthsMinusOneDayAsEndOfDay(new Date('2026-01-31T12:00:00-03:00'), 1);
  const expected = new Date('2026-02-27T23:59:59.999-03:00');
  assert.equal(result.toISOString(), expected.toISOString());
});

test('addCivilMonthsMinusOneDayAsEndOfDay: 31/mar + 1 mês - 1 dia = 29/abr (clamp em 30/abr, menos um dia)', () => {
  const result = addCivilMonthsMinusOneDayAsEndOfDay(new Date('2026-03-31T12:00:00-03:00'), 1);
  const expected = new Date('2026-04-29T23:59:59.999-03:00');
  assert.equal(result.toISOString(), expected.toISOString());
});

test('addCivilMonthsMinusOneDayAsEndOfDay: 29/fev bissexto + 12 meses - 1 dia = 27/fev do ano seguinte', () => {
  const result = addCivilMonthsMinusOneDayAsEndOfDay(new Date('2028-02-29T12:00:00-03:00'), 12);
  const expected = new Date('2029-02-27T23:59:59.999-03:00');
  assert.equal(result.toISOString(), expected.toISOString());
});

test('renovação mensal encadeada depois de um clamp: o dia clampado se mantém nos ciclos seguintes (não tenta "recuperar" o dia 31 original)', () => {
  // Simula extendMonthlyAccessPeriod chamado em sequência a partir de um
  // endDate que já sofreu clamp (ver tests/contract-activation.test.ts para
  // o teste direto de extendMonthlyAccessPeriod).
  let endDate = addCivilMonthsAsEndOfDay(new Date('2026-01-31T12:00:00-03:00'), 1); // -> 28/fev
  assert.equal(endDate.toISOString(), new Date('2026-02-28T23:59:59.999-03:00').toISOString());

  endDate = addCivilMonthsAsEndOfDay(endDate, 1); // 28/fev -> 28/mar (março tem 31 dias, sem novo clamp)
  assert.equal(endDate.toISOString(), new Date('2026-03-28T23:59:59.999-03:00').toISOString());

  endDate = addCivilMonthsAsEndOfDay(endDate, 1); // 28/mar -> 28/abr
  assert.equal(endDate.toISOString(), new Date('2026-04-28T23:59:59.999-03:00').toISOString());
});
