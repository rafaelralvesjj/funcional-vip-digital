CREATE TABLE IF NOT EXISTS "service_plan_billing_options" (
  "id" TEXT NOT NULL,
  "service_plan_id" TEXT NOT NULL,
  "billing_cycle" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "recommended" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_plan_billing_options_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "service_plan_billing_options_service_plan_id_billing_cycle_key" ON "service_plan_billing_options"("service_plan_id", "billing_cycle");
CREATE INDEX IF NOT EXISTS "service_plan_billing_options_service_plan_id_idx" ON "service_plan_billing_options"("service_plan_id");
CREATE INDEX IF NOT EXISTS "service_plan_billing_options_active_idx" ON "service_plan_billing_options"("active");
DO $$ BEGIN
  ALTER TABLE "service_plan_billing_options" ADD CONSTRAINT "service_plan_billing_options_service_plan_id_fkey" FOREIGN KEY ("service_plan_id") REFERENCES "service_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
