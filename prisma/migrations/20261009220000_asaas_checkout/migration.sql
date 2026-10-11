-- Fase 3: checkout/webhook Asaas. Migration 100% aditiva: ADD COLUMN IF NOT
-- EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. Nenhum
-- DROP, nenhuma alteração destrutiva em coluna/tabela existente.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "cpf_cnpj" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "asaas_customer_id" TEXT;

ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "provider_payment_id" TEXT;
ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "provider_subscription_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "contract_payments_provider_payment_id_key" ON "contract_payments"("provider_payment_id");

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");
