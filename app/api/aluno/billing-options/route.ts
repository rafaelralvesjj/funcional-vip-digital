import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveBillingOption } from "@/lib/service-plan-eligibility";

export const dynamic = "force-dynamic";

/**
 * Opções de cobrança disponíveis para o aluno contratar sozinho (checkout
 * self-service). Só o modelo novo (ServicePlan com ServicePlanBillingOption
 * ativa) aparece aqui — o checkout precisa de um billingOptionId para gerar
 * a cobrança, então um plano legado sem BillingOption nunca é uma opção
 * válida neste fluxo (continua existindo só para a conversão manual feita
 * pela gestão em app/dashboard/financeiro).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const plans = await prisma.servicePlan.findMany({
      where: { active: true },
      include: {
        billingOptions: {
          where: { active: true },
          orderBy: { billingCycle: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const eligiblePlans = plans
      .filter((plan) => hasActiveBillingOption(plan.billingOptions))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        workoutsPerWeek: plan.workoutsPerWeek,
        workoutsPerMonth: plan.workoutsPerMonth,
        billingOptions: plan.billingOptions.map((option) => ({
          id: option.id,
          billingCycle: option.billingCycle,
          amountCents: option.amountCents,
          recommended: option.recommended,
        })),
      }));

    return NextResponse.json({ ok: true, plans: eligiblePlans });
  } catch (error) {
    console.error("Erro ao carregar opções de cobrança para o aluno", error);
    return NextResponse.json({ ok: false, error: "Erro ao carregar opções de cobrança." }, { status: 500 });
  }
}
