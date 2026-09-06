import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import {
  buildRenewalSchedule,
  isRenewablePaidContract,
} from "@/lib/contract-renewal.mjs";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

function renewalContractNumber(): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REN-${Date.now()}-${suffix}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const contractId = String(params?.id || "").trim();

    if (!contractId) {
      return NextResponse.json({ error: "Contrato é obrigatório." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.studentContract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          studentId: true,
          planId: true,
          professorId: true,
          type: true,
          status: true,
          endDate: true,
          durationMonths: true,
          workoutsPerWeek: true,
          workoutsPerMonth: true,
          totalContractedWorkouts: true,
          priceCents: true,
          paymentMode: true,
          notes: true,
        },
      });

      if (!current) {
        throw new Error("RENEWAL_CONTRACT_NOT_FOUND");
      }

      if (!isRenewablePaidContract(current)) {
        throw new Error("RENEWAL_NOT_ALLOWED");
      }

      if (current.priceCents <= 0) {
        throw new Error("RENEWAL_INVALID_PRICE");
      }

      const existingRenewal = await tx.studentContract.findFirst({
        where: {
          renewedFromContractId: current.id,
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
        },
      });

      if (existingRenewal) {
        throw new Error("RENEWAL_ALREADY_EXISTS");
      }

      const schedule = buildRenewalSchedule({
        currentEndDate: current.endDate,
        durationMonths: current.durationMonths,
      });

      const renewedContract = await tx.studentContract.create({
        data: {
          studentId: current.studentId,
          planId: current.planId,
          professorId: current.professorId,
          contractNumber: renewalContractNumber(),
          type: "PAID",
          status: "AWAITING_PAYMENT",
          commercialStatus: "AGUARDANDO_PAGAMENTO",
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          durationMonths: current.durationMonths,
          workoutsPerWeek: current.workoutsPerWeek,
          workoutsPerMonth: current.workoutsPerMonth,
          totalContractedWorkouts: current.totalContractedWorkouts,
          priceCents: current.priceCents,
          paymentMode: current.paymentMode || "UNICO",
          source: "RENOVACAO",
          notes: current.notes
            ? `${current.notes}\nRenovação do contrato ${current.id}.`
            : `Renovação do contrato ${current.id}.`,
          renewedFromContractId: current.id,
          createdById: userId,
        },
        select: {
          id: true,
          contractNumber: true,
          startDate: true,
          endDate: true,
          priceCents: true,
        },
      });

      const payment = await tx.contractPayment.create({
        data: {
          contractId: renewedContract.id,
          studentId: current.studentId,
          amountCents: current.priceCents,
          dueDate: schedule.dueDate,
          status: "EM_ABERTO",
          method: "PIX",
          notes: `Cobrança criada automaticamente pela renovação do contrato ${current.id}.`,
          createdById: userId,
        },
        select: {
          id: true,
          amountCents: true,
          dueDate: true,
          status: true,
        },
      });

      return {
        contract: renewedContract,
        payment,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "Renovação criada aguardando pagamento.",
      ...result,
    });
  } catch (error: any) {
    const message = String(error?.message || "");

    if (message === "RENEWAL_CONTRACT_NOT_FOUND") {
      return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
    }

    if (message === "RENEWAL_NOT_ALLOWED") {
      return NextResponse.json(
        { error: "Somente contratos pagos e ativos podem ser renovados." },
        { status: 409 }
      );
    }

    if (message === "RENEWAL_INVALID_PRICE") {
      return NextResponse.json(
        { error: "O contrato atual não possui um valor válido para renovação." },
        { status: 409 }
      );
    }

    if (message === "RENEWAL_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "Este contrato já possui uma renovação criada." },
        { status: 409 }
      );
    }

    console.error("POST /api/student-contracts/[id]/renew error:", error);

    return NextResponse.json(
      {
        error: "Erro ao renovar contrato.",
        message,
      },
      { status: 500 }
    );
  }
}
