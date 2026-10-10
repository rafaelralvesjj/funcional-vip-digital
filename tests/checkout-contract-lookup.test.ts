import test from 'node:test';
import assert from 'node:assert/strict';
import { findActivePaidContract, findPendingPaidReservation } from '../lib/checkout-contract-lookup.ts';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

test('findActivePaidContract encontra um PAID ACTIVE ainda em vigor', () => {
  const contracts = [
    { id: 'c1', type: 'PAID', status: 'ACTIVE', endDate: daysFromNow(10) },
  ];

  assert.equal(findActivePaidContract(contracts)?.id, 'c1');
});

test('findActivePaidContract ignora um PAID ACTIVE já vencido', () => {
  const contracts = [
    { id: 'c1', type: 'PAID', status: 'ACTIVE', endDate: daysFromNow(-10) },
  ];

  assert.equal(findActivePaidContract(contracts), undefined);
});

test('findActivePaidContract ignora AWAITING_PAYMENT', () => {
  const contracts = [
    { id: 'c1', type: 'PAID', status: 'AWAITING_PAYMENT', endDate: daysFromNow(10) },
  ];

  assert.equal(findActivePaidContract(contracts), undefined);
});

// REVISÃO (ponto 3): o caso central desta rodada. Uma reserva antiga, cujo
// endDate é só o placeholder de duração calculado na criação do checkout
// (addMonthsMinusOneDay) e já ficou no passado, continua sendo a reserva
// pendente válida — nunca pode ficar invisível por causa dessa data. Se
// ficasse invisível, o checkout tentaria reservar de novo, colidiria no
// índice único parcial (um PAID AWAITING_PAYMENT por aluno) e o aluno
// ficaria preso em CHECKOUT_IN_PROGRESS para sempre.
test('REVISÃO (ponto 3): checkout pendente antigo com placeholder endDate já vencido ainda é encontrado — nunca fica invisível', () => {
  const contracts = [
    {
      id: 'reserva-antiga',
      type: 'PAID',
      status: 'AWAITING_PAYMENT',
      // Placeholder de duração calculado há muito tempo — já "venceu", mas
      // isso não significa que o pagamento falhou ou que a reserva expirou.
      endDate: daysFromNow(-60),
    },
  ];

  const encontrada = findPendingPaidReservation(contracts);

  assert.equal(encontrada?.id, 'reserva-antiga');
});

test('findPendingPaidReservation encontra a reserva mesmo com endDate no futuro', () => {
  const contracts = [
    { id: 'reserva-nova', type: 'PAID', status: 'AWAITING_PAYMENT', endDate: daysFromNow(10) },
  ];

  assert.equal(findPendingPaidReservation(contracts)?.id, 'reserva-nova');
});

test('findPendingPaidReservation ignora um PAID ACTIVE', () => {
  const contracts = [
    { id: 'c1', type: 'PAID', status: 'ACTIVE', endDate: daysFromNow(10) },
  ];

  assert.equal(findPendingPaidReservation(contracts), undefined);
});

test('findPendingPaidReservation ignora um TRIAL', () => {
  const contracts = [
    { id: 't1', type: 'TRIAL', status: 'ACTIVE', endDate: daysFromNow(2) },
  ];

  assert.equal(findPendingPaidReservation(contracts), undefined);
});

test('nenhuma das duas funções quebra com lista vazia', () => {
  assert.equal(findActivePaidContract([]), undefined);
  assert.equal(findPendingPaidReservation([]), undefined);
});
