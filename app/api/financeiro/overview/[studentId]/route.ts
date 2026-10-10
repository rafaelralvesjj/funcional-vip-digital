import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { formatBillingLabel, resolveStudentCommercialRow } from "@/lib/commercial-status-resolver";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

type HistoryEvent = {
  date: string;
  label: string;
  contractId: string;
  paymentId: string | null;
};

/**
 * Linha do tempo reunindo contrato(s) + cobrança(s) do aluno — nunca inventa
 * um evento que não tenha um timestamp real gravado (acceptedAt/activatedAt/
 * finalizedAt/cancelledAt/suspendedAt no contrato, paidAt/createdAt na
 * cobrança); só organiza o que já existe em ordem cronológica decrescente.
 */
function buildHistory(contracts: any[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  for (const contract of contracts) {
    const planLabel = contract.plan?.name || "Plano avulso";

    events.push({
      date: contract.createdAt,
      label: `Contrato criado (${contract.type === "TRIAL" ? "experiência" : "pago"}) — ${planLabel}`,
      contractId: contract.id,
      paymentId: null,
    });

    if (contract.termsAcceptedAt) {
      events.push({
        date: contract.termsAcceptedAt,
        label: `Termos aceitos (versão ${contract.termsVersion || "?"})`,
        contractId: contract.id,
        paymentId: null,
      });
    }

    if (contract.acceptedAt) {
      events.push({ date: contract.acceptedAt, label: "Contrato aceito", contractId: contract.id, paymentId: null });
    }

    if (contract.activatedAt) {
      events.push({ date: contract.activatedAt, label: "Contrato ativado", contractId: contract.id, paymentId: null });
    }

    if (contract.suspendedAt) {
      events.push({ date: contract.suspendedAt, label: "Contrato suspenso", contractId: contract.id, paymentId: null });
    }

    if (contract.finalizedAt) {
      events.push({ date: contract.finalizedAt, label: "Contrato encerrado", contractId: contract.id, paymentId: null });
    }

    if (contract.cancelledAt) {
      events.push({ date: contract.cancelledAt, label: "Contrato cancelado", contractId: contract.id, paymentId: null });
    }

    for (const payment of contract.payments || []) {
      events.push({
        date: payment.createdAt,
        label: `Cobrança criada — ${payment.status}`,
        contractId: contract.id,
        paymentId: payment.id,
      });

      if (payment.paidAt) {
        events.push({
          date: payment.paidAt,
          label: "Pagamento confirmado",
          contractId: contract.id,
          paymentId: payment.id,
        });
      }
    }
  }

  return events
    .filter((event) => event.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((event) => ({ ...event, date: new Date(event.date).toISOString() }));
}

function normalizeContractDetail(contract: any) {
  return {
    id: contract.id,
    type: contract.type,
    status: contract.status,
    commercialStatus: contract.commercialStatus,
    source: contract.source,
    paymentMode: contract.paymentMode,
    planName: contract.plan?.name || "Plano avulso",
    billingLabel: formatBillingLabel(contract),
    billingCycle: contract.billingCycle,
    billingOptionAmountCents: contract.billingOption?.amountCents ?? null,
    priceCents: contract.priceCents,
    durationMonths: contract.durationMonths,
    startDate: contract.startDate,
    endDate: contract.endDate,
    acceptedAt: contract.acceptedAt,
    activatedAt: contract.activatedAt,
    finalizedAt: contract.finalizedAt,
    cancelledAt: contract.cancelledAt,
    suspendedAt: contract.suspendedAt,
    termsVersion: contract.termsVersion,
    termsAcceptedAt: contract.termsAcceptedAt,
    renewedFromContractId: contract.renewedFromContractId,
    notes: contract.notes,
    payments: (contract.payments || []).map((payment: any) => ({
      id: payment.id,
      status: payment.status,
      amountCents: payment.amountCents,
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      method: payment.method,
      provider: payment.provider,
      // Link real do ContractPayment — nunca um link estático/genérico.
      // Ausente quando a cobrança ainda não tem um (reservada mas não
      // reconciliada com a Asaas ainda, ou pagamento manual sem link).
      paymentLinkUrl: payment.paymentLinkUrl || null,
      externalReference: payment.externalReference,
      providerPaymentId: payment.providerPaymentId,
      providerSubscriptionId: payment.providerSubscriptionId,
      receiptUrl: payment.receiptUrl,
      notes: payment.notes,
      createdAt: payment.createdAt,
    })),
  };
}

export async function GET(request: NextRequest, { params }: { params: { studentId: string } }) {
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

    const student = await prisma.student.findUnique({
      where: { id: params.studentId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        cpfCnpj: true,
        asaasCustomerId: true,
        commercialStatus: true,
        contracts: {
          orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
          include: {
            plan: { select: { id: true, name: true } },
            billingOption: { select: { id: true, billingCycle: true, amountCents: true } },
            payments: { orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    const currentRow = resolveStudentCommercialRow(student);

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        cpfCnpj: student.cpfCnpj,
        asaasCustomerId: student.asaasCustomerId,
        commercialStatus: student.commercialStatus,
      },
      currentRow: currentRow
        ? { ...currentRow, nextDate: currentRow.nextDate ? currentRow.nextDate.toISOString() : null }
        : null,
      contracts: student.contracts.map(normalizeContractDetail),
      history: buildHistory(student.contracts),
    });
  } catch (error: any) {
    console.error("GET /api/financeiro/overview/[studentId] error:", error);
    return NextResponse.json({ error: "Erro ao carregar o detalhe financeiro." }, { status: 500 });
  }
}
