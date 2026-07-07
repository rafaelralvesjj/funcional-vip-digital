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

function parseDate(value?: string | null): Date {
  if (!value) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }

  return date;
}

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function contractNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();

    const trialContractId = String(body?.trialContractId || "").trim();
    const planId = String(body?.planId || "").trim();
    const durationMonths = Math.max(toInt(body?.durationMonths, 1), 1);
    const startDate = parseDate(body?.startDate);
    const endDate = addMonthsMinusOneDay(startDate, durationMonths);
    const priceCents = toInt(body?.priceCents, 0);
    const dueDate = parseDate(body?.dueDate);
    const paymentMethod = String(body?.paymentMethod || "PIX").toUpperCase();
    const paymentStatus = String(body?.paymentStatus || "EM_ABERTO").toUpperCase();
    const paymentLinkUrl = String(body?.paymentLinkUrl || "").trim() || null;
    const paymentNotes = String(body?.paymentNotes || "").trim() || null;
    const notes = String(body?.notes || "").trim() || null;

    if (!trialContractId) {
      return NextResponse.json(
        { error: "Selecione a experiência que será convertida." },
        { status: 400 }
      );
    }

    if (!planId) {
      return NextResponse.json(
        { error: "Selecione o plano pago." },
        { status: 400 }
      );
    }

    if (priceCents <= 0) {
      return NextResponse.json(
        { error: "Informe o valor do plano pago." },
        { status: 400 }
      );
    }

    if (!["EM_ABERTO", "PAGO", "PARCIAL"].includes(paymentStatus)) {
      return NextResponse.json(
        { error: "Para conversão, o pagamento deve ficar em aberto, parcial ou pago." },
        { status: 400 }
      );
    }

    const trial = await prisma.studentContract.findUnique({
      where: {
        id: trialContractId,
      },
      include: {
        student: true,
        professor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        plan: true,
      },
    });

    if (!trial) {
      return NextResponse.json({ error: "Experiência não encontrada." }, { status: 404 });
    }

    if (trial.type !== "TRIAL") {
      return NextResponse.json(
        { error: "O contrato selecionado não é uma experiência grátis." },
        { status: 400 }
      );
    }

    if (trial.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "A experiência selecionada não está ativa." },
        { status: 400 }
      );
    }

    const paidPlan = await prisma.servicePlan.findUnique({
      where: {
        id: planId,
      },
    });

    if (!paidPlan || paidPlan.active === false) {
      return NextResponse.json(
        { error: "Plano pago não encontrado ou inativo." },
        { status: 404 }
      );
    }

    if (paidPlan.allowTrial) {
      return NextResponse.json(
        { error: "Selecione um plano pago, não o plano de experiência grátis." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const shouldActivateNow = paymentStatus === "PAGO";

      if (shouldActivateNow) {
        await tx.studentContract.updateMany({
          where: {
            studentId: trial.studentId,
            status: "ACTIVE",
          },
          data: {
            status: "FINALIZED",
            commercialStatus: "FINALIZADO",
            finalizedAt: new Date(),
          },
        });
      }

      const paidContract = await tx.studentContract.create({
        data: {
          studentId: trial.studentId,
          planId: paidPlan.id,
          professorId: trial.professorId,
          contractNumber: contractNumber("CTR"),
          type: "PAID",
          status: shouldActivateNow ? "ACTIVE" : "AWAITING_PAYMENT",
          commercialStatus: shouldActivateNow ? "CONTRATO_ATIVO" : "AGUARDANDO_PAGAMENTO",
          startDate,
          endDate,
          durationMonths,
          workoutsPerWeek: paidPlan.workoutsPerWeek,
          workoutsPerMonth: paidPlan.workoutsPerMonth,
          totalContractedWorkouts: paidPlan.workoutsPerMonth * durationMonths,
          priceCents,
          paymentMode: "UNICO",
          source: "CONVERSAO_EXPERIENCIA",
          notes: [
            "Contrato criado pela conversão da experiência gratuita.",
            `Experiência de origem: ${trial.contractNumber || trial.id}.`,
            notes || null,
          ]
            .filter(Boolean)
            .join("\n"),
          renewedFromContractId: trial.id,
          createdById: userId,
          acceptedAt: shouldActivateNow ? new Date() : null,
          activatedAt: shouldActivateNow ? new Date() : null,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          plan: true,
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      const payment = await tx.contractPayment.create({
        data: {
          contractId: paidContract.id,
          studentId: trial.studentId,
          amountCents: priceCents,
          dueDate,
          paidAt: paymentStatus === "PAGO" ? new Date() : null,
          status: paymentStatus,
          method: paymentMethod,
          paymentLinkUrl,
          notes: paymentNotes,
          createdById: userId,
        },
      });

      if (shouldActivateNow) {
        await tx.student.update({
          where: {
            id: trial.studentId,
          },
          data: {
            commercialStatus: "CONTRATO_ATIVO",
            contractedTrainingDaysPerMonth: paidContract.workoutsPerMonth,
            ...(trial.professorId ? { userId: trial.professorId } : {}),
          },
        });
      }

      return {
        paidContract,
        payment,
        activatedNow: shouldActivateNow,
      };
    });

    return NextResponse.json({
      ok: true,
      message: result.activatedNow
        ? "Experiência convertida em contrato pago e pagamento marcado como pago."
        : "Contrato pago criado aguardando pagamento. A experiência permanece ativa até o pagamento ser confirmado ou até vencer.",
      contract: result.paidContract,
      payment: result.payment,
    });
  } catch (error: any) {
    console.error("POST /api/student-contracts/convert-trial error:", error);

    return NextResponse.json(
      {
        error: "Erro ao converter experiência.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
