import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findActivePaidContract,
  findPendingPaidReservation,
  findResumablePendingPayment,
} from '../lib/checkout-contract-lookup.ts';

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

// REVISÃO (ponto 1, quinta rodada): findActivePaidContract não pode depender
// do fuso horário do host (na Vercel, UTC). O endDate de um contrato PAID
// ACTIVE já é um instante real de término (sempre gravado como fim do dia
// civil de America/Sao_Paulo — ver lib/civil-month.ts), então a comparação
// tem que ser direta por instante, nunca truncada para "início do dia" no
// fuso do processo.
test('REVISÃO (ponto 1): contrato que termina 2026-10-09T23:59:59.999-03:00 já está expirado às 2026-10-10T03:00:00Z', () => {
  const contracts = [
    {
      id: 'c1',
      type: 'PAID',
      status: 'ACTIVE',
      endDate: new Date('2026-10-09T23:59:59.999-03:00'),
    },
  ];

  const referencia = new Date('2026-10-10T03:00:00Z');

  assert.equal(findActivePaidContract(contracts, referencia), undefined);
});

test('REVISÃO (ponto 1): o mesmo contrato ainda está em vigor 1ms antes do término', () => {
  const contracts = [
    {
      id: 'c1',
      type: 'PAID',
      status: 'ACTIVE',
      endDate: new Date('2026-10-09T23:59:59.999-03:00'),
    },
  ];

  const referencia = new Date('2026-10-10T02:59:59.999Z'); // mesmo instante do endDate

  assert.equal(findActivePaidContract(contracts, referencia)?.id, 'c1');
});

// REVISÃO (ponto 2, quinta rodada): o webhook (PAYMENT_OVERDUE) transforma
// EM_ABERTO em ATRASADO quando a cobrança vence sem confirmação — isso não
// pode deixar a reserva sem caminho de retomada.
test('REVISÃO (ponto 2): findResumablePendingPayment encontra um pagamento ATRASADO, não só EM_ABERTO', () => {
  const payments = [{ id: 'p1', status: 'ATRASADO' }];

  assert.equal(findResumablePendingPayment(payments)?.id, 'p1');
});

test('findResumablePendingPayment encontra um pagamento EM_ABERTO', () => {
  const payments = [{ id: 'p1', status: 'EM_ABERTO' }];

  assert.equal(findResumablePendingPayment(payments)?.id, 'p1');
});

test('findResumablePendingPayment ignora um pagamento já PAGO ou CANCELADO', () => {
  assert.equal(findResumablePendingPayment([{ id: 'p1', status: 'PAGO' }]), undefined);
  assert.equal(findResumablePendingPayment([{ id: 'p1', status: 'CANCELADO' }]), undefined);
});

// REVISÃO (ponto 2, cenário completo pedido): webhook marca o pagamento
// ATRASADO → aluno volta ao /api/aluno/checkout → a mesma sequência de
// decisão da rota (findActivePaidContract, depois findPendingPaidReservation,
// depois findResumablePendingPayment nos payments dessa reserva) tem que
// apontar para o MESMO contractId/paymentId — nunca cair no ramo de criar
// uma reserva nova (que colidiria no índice único parcial).
test('REVISÃO (ponto 2): webhook marca ATRASADO → aluno volta ao checkout → mesmo contract/payment é retomado, sem nova reserva', () => {
  const contractOriginal = {
    id: 'contrato-1',
    type: 'PAID',
    status: 'AWAITING_PAYMENT',
    endDate: new Date('2026-11-09T23:59:59.999-03:00'), // placeholder, irrelevante aqui
    payments: [
      {
        id: 'pagamento-1',
        status: 'ATRASADO', // o webhook já rodou PAYMENT_OVERDUE antes desta chamada
        providerPaymentId: 'pay_123',
        providerSubscriptionId: null,
        externalReference: 'chk_original',
        paymentLinkUrl: 'https://sandbox.asaas.com/i/pay_123',
      },
    ],
  };

  const contracts = [contractOriginal];

  // Passo 1 da rota: não há PAID ACTIVE em vigor.
  assert.equal(findActivePaidContract(contracts as any), undefined);

  // Passo 2: a reserva AWAITING_PAYMENT é encontrada.
  const pendingPaidContract = findPendingPaidReservation(contracts as any);
  assert.equal(pendingPaidContract?.id, 'contrato-1');

  // Passo 3: o pagamento ATRASADO é reconhecido como retomável.
  const pendingPayment = findResumablePendingPayment(pendingPaidContract!.payments as any);
  assert.equal(pendingPayment?.id, 'pagamento-1');

  // A rota reaproveita o mesmo link (paymentLinkUrl já existe) em vez de
  // chamar a Asaas de novo — e, mesmo que precisasse reconciliar, usaria os
  // mesmos providerPaymentId/providerSubscriptionId/externalReference já
  // gravados, nunca criando um contrato ou cobrança novos.
  assert.equal(pendingPayment?.paymentLinkUrl, 'https://sandbox.asaas.com/i/pay_123');
  assert.equal(pendingPayment?.providerPaymentId, 'pay_123');
  assert.equal(pendingPayment?.externalReference, 'chk_original');

  // A condição exata da rota para o ramo de retomada (nunca reservar de
  // novo) é "pendingPaidContract && pendingPayment" — confirma que os dois
  // são truthy.
  assert.ok(pendingPaidContract && pendingPayment);
});
