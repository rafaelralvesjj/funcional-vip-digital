import test from "node:test";
import assert from "node:assert/strict";
import { checkAsaasPaymentForReconciliation } from "../lib/asaas-payment-reconciliation.ts";

const expected = {
  providerPaymentId: "pay_123",
  amountCents: 990,
  externalReference: "chk_123",
  providerSubscriptionId: "sub_123",
  customerId: "cus_123",
};
const remote = {
  id: "pay_123",
  status: "CONFIRMED",
  value: 9.9,
  externalReference: "chk_123",
  subscription: "sub_123",
  customer: "cus_123",
};
test("aceita pagamento CONFIRMED correspondente a mesma cobranca", () => {
  assert.equal(checkAsaasPaymentForReconciliation(remote, expected).confirmed, true);
});
test("aceita RECEIVED da mesma cobranca", () => {
  assert.equal(checkAsaasPaymentForReconciliation({ ...remote, status: "RECEIVED" }, expected).confirmed, true);
});
test("bloqueia status nao pago, valor diferente ou identificadores inconsistentes", () => {
  for (const changed of [
    { status: "PENDING" },
    { status: "REFUNDED" },
    { status: "RECEIVED_IN_CASH" },
    { value: 99.9 },
    { id: "pay_diferente" },
    { subscription: "sub_diferente" },
    { customer: "cus_diferente" },
    { externalReference: "chk_diferente" },
  ]) {
    assert.equal(checkAsaasPaymentForReconciliation({ ...remote, ...changed }, expected).confirmed, false, JSON.stringify(changed));
  }
});
