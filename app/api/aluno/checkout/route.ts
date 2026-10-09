import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import {
  getAsaasClientConfig,
  AsaasConfigError,
  AsaasApiError,
  findAsaasCustomerByExternalReference,
  createAsaasCustomer,
  createAsaasPayment,
  createAsaasSubscription,
  listAsaasSubscriptionPayments,
} from "@/lib/asaas-client";
import { buildCheckoutExternalReference } from "@/lib/checkout-reference";
import { assertTermsAccepted, TermsNotAcceptedError, CHECKOUT_TERMS_VERSION } from "@/lib/checkout-terms";
import { reserveCheckoutSlot, CheckoutAlreadyPendingError } from "@/lib/checkout-reservation";

export const dynamic = "force-dynamic";

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function normalizeCpfCnpj(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function buildStudentWhere(userId?: string | null, email?: string | null) {
  const orWhere: any[] = [];
  const normalizedEmail = normalizeEmail(email);

  if (userId) {
    orWhere.push({ userAuthId: userId });
    orWhere.push({ userId });
  }

  if (normalizedEmail) {
    orWhere.push({ email: { equals: normalizedEmail, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: normalizedEmail, mode: "insensitive" } } });
  }

  return orWhere;
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + Math.max(months, 1));
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  return endDate;
}

function toAsaasDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: NextRequest) {
  // Reservado na fase 1 (reserveCheckoutSlot); se a fase 2 (Asaas) falhar,
  // compensamos removendo essas linhas para o aluno poder tentar de novo —
  // ver o catch de AsaasApiError/AsaasConfigError mais abaixo.
  let reservedContractId: string | null = null;
  let reservedPaymentId: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const billingOptionId = String(body?.billingOptionId || "").trim();
    const acceptedTerms = body?.acceptedTerms;
    const cpfCnpjInput = normalizeCpfCnpj(body?.cpfCnpj);
    const phoneInput = String(body?.phone || "").trim() || null;

    if (!billingOptionId) {
      return NextResponse.json({ error: "Selecione uma opção de cobrança." }, { status: 400 });
    }

    try {
      assertTermsAccepted(acceptedTerms);
    } catch (error) {
      if (error instanceof TermsNotAcceptedError) {
        return NextResponse.json({ error: error.message, code: "TERMS_NOT_ACCEPTED" }, { status: 400 });
      }
      throw error;
    }

    const orWhere = buildStudentWhere(sessionUser.id, sessionUser.email);
    if (!orWhere.length) {
      return NextResponse.json({ error: "Usuário sem identificação suficiente." }, { status: 400 });
    }

    const student = await prisma.student.findFirst({
      where: { active: true, OR: orWhere },
      include: {
        contracts: {
          orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
          include: { payments: { orderBy: { createdAt: "desc" } } },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado para o usuário autenticado." }, { status: 404 });
    }

    const today = startOfDay(new Date());

    // Checagem rápida (não durável sozinha — ver reserveCheckoutSlot para a
    // trava real): evita a chamada à Asaas no caminho comum de "já existe um
    // contrato pago", sem depender dela para a exclusão mútua de verdade.
    const existingPaidContract = student.contracts.find((contract) => {
      if (contract.type !== "PAID") return false;
      if (!["ACTIVE", "AWAITING_PAYMENT"].includes(contract.status)) return false;
      return startOfDay(new Date(contract.endDate)).getTime() >= today.getTime();
    });

    if (existingPaidContract) {
      if (existingPaidContract.status === "ACTIVE") {
        return NextResponse.json(
          { error: "Você já tem um contrato pago ativo.", code: "PAID_CONTRACT_ALREADY_ACTIVE" },
          { status: 409 }
        );
      }

      // AWAITING_PAYMENT: reaproveita o checkout já criado em vez de abrir
      // uma segunda cobrança/assinatura para o mesmo contrato pendente.
      const pendingPayment = existingPaidContract.payments.find(
        (payment) => payment.status === "EM_ABERTO" && payment.paymentLinkUrl
      );

      if (pendingPayment) {
        return NextResponse.json({
          ok: true,
          reused: true,
          checkoutUrl: pendingPayment.paymentLinkUrl,
          contractId: existingPaidContract.id,
          paymentId: pendingPayment.id,
        });
      }
    }

    const billingOption = await prisma.servicePlanBillingOption.findUnique({
      where: { id: billingOptionId },
      include: { servicePlan: true },
    });

    if (
      !billingOption ||
      billingOption.active === false ||
      !billingOption.servicePlan ||
      billingOption.servicePlan.active === false
    ) {
      return NextResponse.json(
        { error: "Opção de cobrança inválida ou indisponível." },
        { status: 404 }
      );
    }

    const cpfCnpj = cpfCnpjInput || normalizeCpfCnpj(student.cpfCnpj);

    if (!cpfCnpj) {
      return NextResponse.json(
        { error: "Informe o CPF/CNPJ para gerar a cobrança.", code: "CPF_CNPJ_REQUIRED" },
        { status: 400 }
      );
    }

    const studentEmail = normalizeEmail(student.email) || normalizeEmail(sessionUser.email);
    if (!studentEmail) {
      return NextResponse.json({ error: "Aluno sem e-mail cadastrado." }, { status: 400 });
    }

    let asaasConfig;
    try {
      asaasConfig = getAsaasClientConfig();
    } catch (error) {
      if (error instanceof AsaasConfigError) {
        console.error("Checkout Asaas indisponível:", error.message);
        return NextResponse.json(
          {
            error: "Checkout indisponível no momento. Fale com a gestão para continuar o pagamento.",
            code: "ASAAS_NOT_CONFIGURED",
          },
          { status: 503 }
        );
      }
      throw error;
    }

    const isMonthly = billingOption.billingCycle === "MONTHLY";
    const durationMonths = isMonthly ? 1 : 12;
    const checkoutExternalReference = buildCheckoutExternalReference();

    const activeTrial = student.contracts.find(
      (contract) => contract.type === "TRIAL" && contract.status === "ACTIVE"
    );

    const placeholderStartDate = new Date();
    const placeholderEndDate = addMonthsMinusOneDay(placeholderStartDate, durationMonths);
    const termsAcceptedAt = new Date();
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");
    const description = `${billingOption.servicePlan.name} — ${isMonthly ? "mensal" : "anual"}`;

    // Fase 1: reserva local, atômica e durável, ANTES de qualquer chamada
    // remota. A trava real é o índice único parcial do Postgres (um PAID
    // AWAITING_PAYMENT por aluno) — ver lib/checkout-reservation.ts. Isso
    // fecha a corrida que existiria em "consulta -> cria na Asaas -> grava":
    // duas requisições simultâneas não conseguem reservar o mesmo slot.
    let reservation;
    try {
      reservation = await prisma.$transaction((tx) =>
        reserveCheckoutSlot(tx as any, {
          contractData: {
            studentId: student.id,
            planId: billingOption.servicePlanId,
            professorId: activeTrial?.professorId || null,
            contractNumber: `CTR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            type: "PAID",
            status: "AWAITING_PAYMENT",
            commercialStatus: "AGUARDANDO_PAGAMENTO",
            startDate: placeholderStartDate,
            endDate: placeholderEndDate,
            durationMonths,
            workoutsPerWeek: billingOption.servicePlan.workoutsPerWeek,
            workoutsPerMonth: billingOption.servicePlan.workoutsPerMonth,
            totalContractedWorkouts: billingOption.servicePlan.workoutsPerMonth * durationMonths,
            priceCents: billingOption.amountCents,
            paymentMode: isMonthly ? "RECORRENTE" : "UNICO",
            source: "CHECKOUT_ASAAS",
            renewedFromContractId: activeTrial?.id || null,
            // Auditoria estruturada (item 6 da revisão) — nunca só em notes.
            billingOptionId: billingOption.id,
            billingCycle: billingOption.billingCycle,
            termsVersion: CHECKOUT_TERMS_VERSION,
            termsAcceptedAt,
            notes: [
              "Checkout criado pelo próprio aluno (Asaas).",
              `Opção de cobrança: ${billingOption.billingCycle} — ${description}.`,
              `Termos aceitos: versão ${CHECKOUT_TERMS_VERSION} em ${termsAcceptedAt.toISOString()}.`,
              ip ? `IP: ${ip}.` : null,
              userAgent ? `User-Agent: ${userAgent}.` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
          buildPaymentData: (contractId) => ({
            contractId,
            studentId: student.id,
            amountCents: billingOption.amountCents,
            dueDate: placeholderStartDate,
            status: "EM_ABERTO",
            method: "UNDEFINED",
            provider: "ASAAS",
            externalReference: checkoutExternalReference,
          }),
        })
      );
    } catch (error) {
      if (error instanceof CheckoutAlreadyPendingError) {
        return NextResponse.json(
          {
            error: "Já existe um checkout sendo criado para você agora. Aguarde alguns segundos e atualize a página.",
            code: "CHECKOUT_IN_PROGRESS",
          },
          { status: 409 }
        );
      }
      throw error;
    }

    reservedContractId = reservation.contract.id;
    reservedPaymentId = reservation.payment.id;

    // Fase 2: chamada remota — fora de qualquer transação local (não dá pra
    // fazer rollback de uma chamada HTTP já aceita pela Asaas). Falha aqui
    // aciona a compensação no catch externo (remove a reserva da fase 1).
    let asaasCustomerId = student.asaasCustomerId;

    if (!asaasCustomerId) {
      const existingCustomer = await findAsaasCustomerByExternalReference(asaasConfig, student.id);
      asaasCustomerId = existingCustomer?.id || null;
    }

    if (!asaasCustomerId) {
      const customer = await createAsaasCustomer(asaasConfig, {
        name: student.name,
        email: studentEmail,
        cpfCnpj,
        phone: phoneInput || student.phone,
        externalReference: student.id,
      });
      asaasCustomerId = customer.id;
    }

    const amountValue = billingOption.amountCents / 100;

    let paymentLinkUrl: string | null = null;
    let providerPaymentId: string | null = null;
    let providerSubscriptionId: string | null = null;
    let dueDate = new Date();

    if (isMonthly) {
      const subscription = await createAsaasSubscription(asaasConfig, {
        customerId: asaasCustomerId,
        billingType: "UNDEFINED",
        value: amountValue,
        nextDueDate: toAsaasDateInput(new Date()),
        externalReference: checkoutExternalReference,
        description,
      });
      providerSubscriptionId = subscription.id;

      const firstPayments = await listAsaasSubscriptionPayments(asaasConfig, subscription.id);
      const firstPayment = firstPayments[0] || null;
      if (firstPayment) {
        providerPaymentId = firstPayment.id;
        paymentLinkUrl = firstPayment.invoiceUrl || null;
        if (firstPayment.dueDate) dueDate = new Date(`${firstPayment.dueDate}T12:00:00`);
      }
    } else {
      const payment = await createAsaasPayment(asaasConfig, {
        customerId: asaasCustomerId,
        billingType: "UNDEFINED",
        value: amountValue,
        dueDate: toAsaasDateInput(new Date()),
        externalReference: checkoutExternalReference,
        description,
      });
      providerPaymentId = payment.id;
      paymentLinkUrl = payment.invoiceUrl || null;
      if (payment.dueDate) dueDate = new Date(`${payment.dueDate}T12:00:00`);
    }

    // Fase 3: finaliza a reserva com os dados reais da Asaas.
    await prisma.$transaction(async (tx) => {
      if (!student.asaasCustomerId) {
        await tx.student.update({
          where: { id: student.id },
          data: {
            asaasCustomerId,
            cpfCnpj: student.cpfCnpj || cpfCnpj,
          },
        });
      }

      await tx.contractPayment.update({
        where: { id: reservedPaymentId! },
        data: {
          paymentLinkUrl,
          providerPaymentId,
          providerSubscriptionId,
          dueDate,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      checkoutUrl: paymentLinkUrl,
      contractId: reservedContractId,
      paymentId: reservedPaymentId,
    });
  } catch (error: any) {
    console.error("POST /api/aluno/checkout error:", error);

    // Compensação: a reserva da fase 1 só faz sentido se a Asaas confirmar a
    // cobrança. Sem isso, o índice único parcial deixaria o aluno travado,
    // incapaz de tentar de novo.
    if (reservedContractId) {
      await prisma.contractPayment.deleteMany({ where: { contractId: reservedContractId } }).catch(() => {});
      await prisma.studentContract.delete({ where: { id: reservedContractId } }).catch(() => {});
    }

    if (error instanceof AsaasApiError) {
      return NextResponse.json(
        {
          error: "Não foi possível gerar a cobrança no momento. Tente novamente em instantes.",
          code: "ASAAS_API_ERROR",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao criar checkout.", message: error?.message },
      { status: 500 }
    );
  }
}
