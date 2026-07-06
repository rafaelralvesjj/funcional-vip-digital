import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizePlan(plan: any) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    workoutsPerWeek: plan.workoutsPerWeek,
    workoutsPerMonth: plan.workoutsPerMonth,
    durationMonths: plan.durationMonths,
    priceCents: plan.priceCents,
    active: plan.active,
    trialDays: plan.trialDays,
    allowTrial: plan.allowTrial,
    sortOrder: plan.sortOrder,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

    const plans = await prisma.servicePlan.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });

    return NextResponse.json({
      plans: plans.map(normalizePlan),
    });
  } catch (error: any) {
    console.error("GET /api/service-plans error:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar planos.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = normalizeRole(user?.role);

    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();

    const name = String(body?.name || "").trim();
    const description = String(body?.description || "").trim() || null;
    const workoutsPerWeek = toInt(body?.workoutsPerWeek, 2);
    const workoutsPerMonth = toInt(body?.workoutsPerMonth, workoutsPerWeek * 4);
    const durationMonths =
      body?.durationMonths === null || body?.durationMonths === undefined || body?.durationMonths === ""
        ? null
        : toInt(body?.durationMonths, 1);
    const priceCents = toInt(body?.priceCents, 0);
    const trialDays = toInt(body?.trialDays, 0);
    const allowTrial = Boolean(body?.allowTrial);
    const active = body?.active === undefined ? true : Boolean(body.active);
    const sortOrder = toInt(body?.sortOrder, 0);

    if (!name) {
      return NextResponse.json({ error: "Nome do plano é obrigatório." }, { status: 400 });
    }

    if (workoutsPerWeek <= 0 || workoutsPerMonth <= 0) {
      return NextResponse.json(
        { error: "Quantidade de treinos por semana e por mês precisa ser maior que zero." },
        { status: 400 }
      );
    }

    const plan = await prisma.servicePlan.create({
      data: {
        name,
        description,
        workoutsPerWeek,
        workoutsPerMonth,
        durationMonths,
        priceCents,
        trialDays,
        allowTrial,
        active,
        sortOrder,
      },
    });

    return NextResponse.json({
      ok: true,
      plan: normalizePlan(plan),
    });
  } catch (error: any) {
    console.error("POST /api/service-plans error:", error);

    return NextResponse.json(
      {
        error: "Erro ao criar plano.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = normalizeRole(user?.role);

    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "ID do plano é obrigatório." }, { status: 400 });
    }

    const data: any = {};

    if (body?.name !== undefined) data.name = String(body.name || "").trim();
    if (body?.description !== undefined) data.description = String(body.description || "").trim() || null;
    if (body?.workoutsPerWeek !== undefined) data.workoutsPerWeek = toInt(body.workoutsPerWeek, 2);
    if (body?.workoutsPerMonth !== undefined) data.workoutsPerMonth = toInt(body.workoutsPerMonth, 8);
    if (body?.durationMonths !== undefined) {
      data.durationMonths =
        body.durationMonths === null || body.durationMonths === "" ? null : toInt(body.durationMonths, 1);
    }
    if (body?.priceCents !== undefined) data.priceCents = toInt(body.priceCents, 0);
    if (body?.trialDays !== undefined) data.trialDays = toInt(body.trialDays, 0);
    if (body?.allowTrial !== undefined) data.allowTrial = Boolean(body.allowTrial);
    if (body?.active !== undefined) data.active = Boolean(body.active);
    if (body?.sortOrder !== undefined) data.sortOrder = toInt(body.sortOrder, 0);

    const plan = await prisma.servicePlan.update({
      where: {
        id,
      },
      data,
    });

    return NextResponse.json({
      ok: true,
      plan: normalizePlan(plan),
    });
  } catch (error: any) {
    console.error("PUT /api/service-plans error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar plano.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
