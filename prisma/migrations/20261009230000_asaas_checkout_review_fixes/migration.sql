-- Fase 3, correções da revisão externa do PR #11. Migration 100% aditiva:
-- ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. Nenhum DROP,
-- nenhuma alteração destrutiva em coluna/tabela existente.

-- Auditoria estruturada da oferta/aceite no momento da contratação (item 6).
ALTER TABLE "student_contracts" ADD COLUMN IF NOT EXISTS "billing_option_id" TEXT;
ALTER TABLE "student_contracts" ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT;
ALTER TABLE "student_contracts" ADD COLUMN IF NOT EXISTS "terms_version" TEXT;
ALTER TABLE "student_contracts" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "student_contracts_billing_option_id_idx" ON "student_contracts"("billing_option_id");

DO $$ BEGIN
  ALTER TABLE "student_contracts" ADD CONSTRAINT "student_contracts_billing_option_id_fkey" FOREIGN KEY ("billing_option_id") REFERENCES "service_plan_billing_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trava de concorrência do checkout self-service (item 5): índice único
-- parcial (não representável no schema.prisma) garantindo que um aluno
-- nunca tenha dois contratos PAID em AWAITING_PAYMENT ao mesmo tempo. Duas
-- requisições de checkout simultâneas colidem aqui; só uma reserva o slot
-- antes de chamar a Asaas (ver lib/checkout-reservation.ts).
CREATE UNIQUE INDEX IF NOT EXISTS "student_contracts_one_pending_paid_per_student"
  ON "student_contracts" ("student_id")
  WHERE "type" = 'PAID' AND "status" = 'AWAITING_PAYMENT';
