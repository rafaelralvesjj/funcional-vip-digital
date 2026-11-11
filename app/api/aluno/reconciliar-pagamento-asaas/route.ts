import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { getAsaasClientConfig, getAsaasPaymentById } from "@/lib/asaas-client";
import { processAsaasWebhookEvent } from "@/lib/asaas-webhook-processor";
import { checkAsaasPaymentForReconciliation } from "@/lib/asaas-payment-reconciliation";

export const dynamic = "force-dynamic";

/**
 * O aluno apenas pede a verificacao da propria cobranca.
 * A API Asaas e a fonte de verdade: nao aceitamos status/valor/ID do cliente.
 * A transacao reutiliza o mesmo processador idempotente do webhook.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null; role?: string } | undefined;
  if (!user?.id || user.role !== "ALUNO") {
    return NextResponse.json({ error: "Acesso nao autorizado." }, { status: 403 });
  }

  const email = user.email?.trim().toLowerCase() || null;
  const student = await prisma.student.findFirst({
    where: {
      active: true,
      OR: [
        { userAuthId: user.id },
        { userId: user.id },
        ...(email ? [
          { email: { equals: email, mode: "insensitive" as const } },
          { userAuth: { email: { equals: email, mode: "insensitive" as const } } },
        ] : []),
      ],
    },
    select: { id: true, asaasCustomerId: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Cadastro do aluno nao encontrado." }, { status: 404 });
  }

  const contract = await prisma.studentContract.findFirst({
    where: {
      studentId: student.id,
      type: "PAID",
      source: "CHECKOUT_ASAAS",
      status: "AWAITING_PAYMENT",
    },
    include: {
      payments: {
        where: { status: { in: ["EM_ABERTO", "ATRASADO"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Tambem e seguro repetir depois da ativacao: informa que ja esta pago.
  if (!contract) {
    const paid = await prisma.studentContract.findFirst({
      where: { studentId: student.id, source: "CHECKOUT_ASAAS", status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (paid?.acceptedAt) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }
    return NextResponse.json({ error: "Nenhuma reserva Asaas pendente para conferir." }, { status: 404 });
  }

  const payment = contract.payments[0];
  if (!payment || payment.provider !== "ASAAS" || !payment.providerPaymentId || !payment.paymentLinkUrl) {
    return NextResponse.json({ error: "A cobranca ainda nao esta vinculada a Asaas." }, { status: 409 });
  }

  try {
    const config = getAsaasClientConfig();
    const remote = await getAsaasPaymentById(config, payment.providerPaymentId);
    const result = checkAsaasPaymentForReconciliation(remote, {
      providerPaymentId: payment.providerPaymentId,
      amountCents: payment.amountCents,
      externalReference: payment.externalReference,
      providerSubscriptionId: payment.providerSubscriptionId,
      customerId: student.asaasCustomerId,
    });

    if (!result.confirmed) {
      return NextResponse.json({ error: result.reason, code: "ASAAS_NOT_CONFIRMED" }, { status: 409 });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const currentPayment = await tx.contractPayment.findUnique({
        where: { id: payment.id },
      });
      const currentContract = await tx.studentContract.findUnique({
        where: { id: contract.id },
      });

      if (!currentPayment || !currentContract ||
          currentContract.studentId !== student.id ||
          currentPayment.contractId !== currentContract.id) {
        throw new Error("Reserva de pagamento foi alterada.");
      }
      if (currentPayment.status === "PAGO" && currentContract.acceptedAt) {
        return { alreadyConfirmed: true };
      }
      if (!["EM_ABERTO", "ATRASADO"].includes(currentPayment.status) ||
          currentContract.status !== "AWAITING_PAYMENT" ||
          currentPayment.providerPaymentId !== remote.id) {
        throw new Error("Estado da reserva mudou; atualizar painel.");
      }

      // Evento normalizado interno, NAO registrado como webhook oficial.
      // O processador usa o providerPaymentId local e a ativacao idempotente.
      const applied = await processAsaasWebhookEvent(tx as any, {
        eventId: `reconciliacao:${remote.id}`,
        eventType: remote.status === "RECEIVED" ? "PAYMENT_RECEIVED" : "PAYMENT_CONFIRMED",
        providerPaymentId: remote.id,
        providerSubscriptionId: remote.subscription || currentPayment.providerSubscriptionId,
        externalReference: remote.externalReference || currentPayment.externalReference,
        value: remote.value ?? null,
        dueDate: remote.dueDate || null,
        isPaymentConfirmation: true,
        isOverdue: false,
      });

      if (!applied.handled) {
        throw new Error("Confirmacao nao aplicada: " + (applied.reason || "desconhecido"));
      }

      await tx.contractPayment.update({
        where: { id: currentPayment.id },
        data: {
          notes: [
            currentPayment.notes,
            `Reconciliado por consulta GET Asaas em ${new Date().toISOString()}; cobrança ${remote.id}; status ${remote.status}.`,
          ].filter(Boolean).join("\n"),
        },
      });

      return { alreadyConfirmed: false };
    });

    console.info("Asaas reconciliada via consulta verificada", {
      studentId: student.id,
      contractId: contract.id,
      paymentId: payment.id,
      alreadyConfirmed: outcome.alreadyConfirmed,
    });

    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    console.error("Erro na reconciliacao Asaas", error);
    return NextResponse.json({
      error: "Nao foi possivel validar o pagamento na Asaas. Nenhuma nova cobranca foi criada.",
    }, { status: 502 });
  }
}
