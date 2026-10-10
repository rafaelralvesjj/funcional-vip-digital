/**
 * Cria/atualiza a oferta comercial atual (3 treinos/semana + 7 dias de
 * teste + mensal R$9,90/anual R$99,90 recomendado). Idempotente: pode ser
 * executado quantas vezes for preciso, em qualquer ambiente. Nunca roda
 * sozinho — é um passo manual e explícito, do mesmo jeito que
 * db:migrate:deploy: primeiro contra o banco do Preview, depois (só com
 * aprovação) contra produção.
 *
 *   DATABASE_URL="<preview>" npx tsx scripts/setup-trial-offer.ts
 *   DATABASE_URL="<producao>" npx tsx scripts/setup-trial-offer.ts
 *
 * Por padrão NÃO desativa nenhum ServicePlan antigo: app/api/student-
 * contracts/convert-trial/route.ts ainda não tem o fluxo de contratação via
 * Asaas/BillingOption testado em produção, e desativar os planos pagos
 * antigos agora deixaria a conversão de teste->pago sem nenhuma opção
 * coerente para quem ainda depende do fluxo manual. A desativação já está
 * implementada, mas só roda com a flag --deactivate-old-plans, para ser
 * ligada deliberadamente quando o novo fluxo estiver operacional e testado:
 *
 *   DATABASE_URL="<producao>" npx tsx scripts/setup-trial-offer.ts --deactivate-old-plans
 *
 * Reaproveita as constantes já usadas pela lógica do teste (lib/trial-plan.ts,
 * lib/trial-window.ts) para que a oferta semeada aqui nunca saia de sincronia
 * com as regras de negócio que a validam depois.
 */
import { PrismaClient } from "@prisma/client";
import { TRIAL_OFFER_WORKOUTS_PER_WEEK } from "../lib/trial-plan";
import { TRIAL_DURATION_DAYS } from "../lib/trial-window";
import {
  assertNoDuplicateBillingCycle,
  assertAtMostOneRecommendedActiveOption,
} from "../lib/service-plan-billing";

const prisma = new PrismaClient();

const OFFER_NAME = "Funcional UP — 3 treinos por semana";
const WORKOUTS_PER_MONTH = 12;
const MONTHLY_PRICE_CENTS = 990;
const ANNUAL_PRICE_CENTS = 9990;
const BILLING_PROVIDER = "ASAAS";
const DEACTIVATE_OLD_PLANS = process.argv.includes("--deactivate-old-plans");

function describeDatabaseTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "(DATABASE_URL não definida)";

  try {
    return new URL(url).host;
  } catch {
    return "(DATABASE_URL em formato inesperado)";
  }
}

async function main() {
  console.log(`Alvo: ${describeDatabaseTarget()}`);
  console.log(`Oferta: "${OFFER_NAME}" — ${TRIAL_OFFER_WORKOUTS_PER_WEEK}x/semana, teste de ${TRIAL_DURATION_DAYS} dias.`);

  const result = await prisma.$transaction(async (tx) => {
    let plan = await tx.servicePlan.findFirst({ where: { name: OFFER_NAME } });

    if (plan) {
      plan = await tx.servicePlan.update({
        where: { id: plan.id },
        data: {
          workoutsPerWeek: TRIAL_OFFER_WORKOUTS_PER_WEEK,
          workoutsPerMonth: WORKOUTS_PER_MONTH,
          durationMonths: 1,
          allowTrial: true,
          trialDays: TRIAL_DURATION_DAYS,
          active: true,
          // Campo legado, preservado só para telas antigas que ainda leem
          // priceCents direto do ServicePlan; novas aquisições usam
          // ServicePlanBillingOption.
          priceCents: MONTHLY_PRICE_CENTS,
        },
      });
      console.log(`Plano já existia (${plan.id}) — atualizado para os valores atuais.`);
    } else {
      plan = await tx.servicePlan.create({
        data: {
          name: OFFER_NAME,
          description: "Plano único atual: 3 treinos por semana, com 7 dias de teste.",
          workoutsPerWeek: TRIAL_OFFER_WORKOUTS_PER_WEEK,
          workoutsPerMonth: WORKOUTS_PER_MONTH,
          durationMonths: 1,
          priceCents: MONTHLY_PRICE_CENTS,
          allowTrial: true,
          trialDays: TRIAL_DURATION_DAYS,
          active: true,
          sortOrder: 0,
        },
      });
      console.log(`Plano criado (${plan.id}).`);
    }

    const desiredBillingOptions = [
      { billingCycle: "MONTHLY" as const, amountCents: MONTHLY_PRICE_CENTS, recommended: false, active: true },
      { billingCycle: "ANNUAL" as const, amountCents: ANNUAL_PRICE_CENTS, recommended: true, active: true },
    ];

    // Validação de camada de serviço antes de persistir (espelha a unique
    // constraint do banco e a regra de recomendada única — ver
    // lib/service-plan-billing.ts), para falhar cedo e com mensagem clara
    // se esta lista for editada incorretamente no futuro.
    assertNoDuplicateBillingCycle(desiredBillingOptions);
    assertAtMostOneRecommendedActiveOption(desiredBillingOptions);

    for (const option of desiredBillingOptions) {
      await tx.servicePlanBillingOption.upsert({
        where: {
          servicePlanId_billingCycle: {
            servicePlanId: plan.id,
            billingCycle: option.billingCycle,
          },
        },
        update: {
          amountCents: option.amountCents,
          recommended: option.recommended,
          active: true,
          provider: BILLING_PROVIDER,
        },
        create: {
          servicePlanId: plan.id,
          billingCycle: option.billingCycle,
          amountCents: option.amountCents,
          recommended: option.recommended,
          active: true,
          provider: BILLING_PROVIDER,
        },
      });
      console.log(
        `  Opção ${option.billingCycle}: R$ ${(option.amountCents / 100).toFixed(2)}${
          option.recommended ? " (recomendada)" : ""
        } [${BILLING_PROVIDER}] OK.`
      );
    }

    if (DEACTIVATE_OLD_PLANS) {
      // Desativa para NOVAS vendas qualquer outro plano ativo — nunca apaga.
      // Contratos existentes guardam sua própria cópia de workoutsPerWeek/
      // priceCents/etc. no momento da criação (StudentContract), então
      // desativar o ServicePlan não afeta contratos já ativos; só tira o
      // plano antigo das listagens/pickers usados para criar contratos novos.
      const deactivated = await tx.servicePlan.updateMany({
        where: {
          id: { not: plan.id },
          active: true,
        },
        data: { active: false },
      });
      console.log(
        `${deactivated.count} plano(s) antigo(s) desativado(s) para novas vendas (nenhum apagado).`
      );
    } else {
      console.log(
        "Planos antigos NÃO foram desativados (padrão) — o fluxo de conversão " +
          "teste->pago ainda não está pronto para o novo modelo (ver " +
          "app/api/student-contracts/convert-trial/route.ts). Rode de novo com " +
          "--deactivate-old-plans quando o fluxo via Asaas/BillingOption estiver " +
          "operacional e testado."
      );
    }

    return plan;
  });

  console.log(`\nOferta configurada com sucesso: ${result.id}`);
}

main()
  .catch((error) => {
    console.error("Erro ao configurar a oferta:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
