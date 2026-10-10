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
} from "@/lib/asaas-client";
import { resolveCheckoutCharge } from "@/lib/checkout-charge";
import { buildCheckoutExternalReference } from "@/lib/checkout-reference";
import { assertTermsAccepted, TermsNotAcceptedError, CHECKOUT_TERMS_VERSION } from "@/lib/checkout-terms";
import { reserveCheckoutSlot, CheckoutAlreadyPendingError } from "@/lib/checkout-reservation";
import { addCivilMonthsMinusOneDayAsEndOfDay } from "@/lib/civil-month";
import { findActivePaidContract, findPendingPaidReservation } from "@/lib/checkout-contract-lookup";

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

// Nunca o setMonth nativo de Date diretamente para a duração comercial do
// placeholder — mesmo helper central de mês civil (com clamp, em
// America/Sao_Paulo) já usado por lib/contract-activation.ts, para as duas
// contas nunca divergirem.
function addMonthsMinusOneDay(startDate: Date, months: number): Date {
  return addCivilMonthsMinusOneDayAsEndOfDay(startDate, Math.max(months, 1));
}

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedBillingOptionId = String(body?.billingOptionId || "").trim();
    const acceptedTerms = body?.acceptedTerms;
    const cpfCnpjInput = normalizeCpfCnpj(body?.cpfCnpj);
    const phoneInput = String(body?.phone || "").trim() || null;

    if (!requestedBillingOptionId) {
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

    const activePaidContract: any = findActivePaidContract(student.contracts as any[], today);

    if (activePaidContract) {
      return NextResponse.json(
        { error: "Você já tem um contrato pago ativo.", code: "PAID_CONTRACT_ALREADY_ACTIVE" },
        { status: 409 }
      );
    }

    // Ver lib/checkout-contract-lookup.ts: a reserva AWAITING_PAYMENT
    // pendente é identificada só por tipo+status, nunca por endDate (item 3
    // da revisão).
    const pendingPaidContract: any = findPendingPaidReservation(student.contracts as any[]);

    // O pagamento pendente dessa reserva é o único que nos interessa — se já
    // tem link, reaproveita; se não tem (reservado mas sem resposta
    // confirmada da Asaas ainda), RETOMA a mesma reserva em vez de tentar
    // criar uma nova (ver fase de reconciliação abaixo). Isto nunca apaga a
    // reserva nem a troca por outra.
    const pendingPayment = pendingPaidContract?.payments.find((payment: any) => payment.status === "EM_ABERTO");

    if (pendingPayment?.paymentLinkUrl) {
      return NextResponse.json({
        ok: true,
        reused: true,
        checkoutUrl: pendingPayment.paymentLinkUrl,
        contractId: pendingPaidContract!.id,
        paymentId: pendingPayment.id,
      });
    }

    // billingOptionId: ao retomar uma reserva existente, usa a opção JÁ
    // reservada (gravada no próprio contrato) — nunca a do corpo da
    // requisição, que poderia divergir de uma tentativa anterior.
    const billingOptionId = pendingPaidContract?.billingOptionId || requestedBillingOptionId;

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
    const description = `${billingOption.servicePlan.name} — ${isMonthly ? "mensal" : "anual"}`;

    let contractId: string;
    let paymentId: string;
    let checkoutExternalReference: string;
    let pendingProviderPaymentId: string | null;
    let pendingProviderSubscriptionId: string | null;

    if (pendingPaidContract && pendingPayment) {
      // Retomando uma reserva já existente (sem paymentLinkUrl ainda) —
      // nunca reserva de novo, nunca apaga nada (item 1 da revisão).
      contractId = pendingPaidContract.id;
      paymentId = pendingPayment.id;
      checkoutExternalReference = pendingPayment.externalReference || buildCheckoutExternalReference();
      pendingProviderPaymentId = pendingPayment.providerPaymentId || null;
      pendingProviderSubscriptionId = pendingPayment.providerSubscriptionId || null;
    } else {
      // Fase 1: reserva local, atômica e durável, ANTES de qualquer chamada
      // remota. A trava real é o índice único parcial do Postgres (um PAID
      // AWAITING_PAYMENT por aluno) — ver lib/checkout-reservation.ts.
      const durationMonths = isMonthly ? 1 : 12;
      const activeTrial = student.contracts.find(
        (contract) => contract.type === "TRIAL" && contract.status === "ACTIVE"
      );
      const placeholderStartDate = new Date();
      const placeholderEndDate = addMonthsMinusOneDay(placeholderStartDate, durationMonths);
      const termsAcceptedAt = new Date();
      const ip = getClientIp(req);
      const userAgent = req.headers.get("user-agent");

      checkoutExternalReference = buildCheckoutExternalReference();
      pendingProviderPaymentId = null;
      pendingProviderSubscriptionId = null;

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
              // Auditoria estruturada (item 6 da revisão anterior) — nunca só em notes.
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
            buildPaymentData: (newContractId) => ({
              contractId: newContractId,
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

      contractId = reservation.contract.id;
      paymentId = reservation.payment.id;
    }

    // Fase 2: resolve a cobrança/assinatura — cria na primeira tentativa,
    // reconcilia com o que já existe (por id já conhecido, ou por busca em
    // externalReference) em qualquer retomada. Nunca é seguro apagar a
    // reserva da fase 1 a partir daqui: pode já ter havido efeito remoto, ou
    // o resultado da chamada pode ter ficado incerto (timeout) — então o
    // catch externo NUNCA remove StudentContract/ContractPayment. A reserva
    // fica como âncora reconciliável para a próxima tentativa (item 1 da
    // revisão).
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

    const charge = await resolveCheckoutCharge({
      config: asaasConfig,
      customerId: asaasCustomerId,
      billingCycle: billingOption.billingCycle,
      amountValue: billingOption.amountCents / 100,
      description,
      pending: {
        providerPaymentId: pendingProviderPaymentId,
        providerSubscriptionId: pendingProviderSubscriptionId,
        externalReference: checkoutExternalReference,
      },
    });

    // Fase 3: finaliza a reserva com os dados reais/reconciliados da Asaas.
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
        where: { id: paymentId },
        data: {
          paymentLinkUrl: charge.paymentLinkUrl,
          providerPaymentId: charge.providerPaymentId,
          providerSubscriptionId: charge.providerSubscriptionId,
          ...(charge.dueDate ? { dueDate: charge.dueDate } : {}),
        },
      });
    });

    return NextResponse.json({
      ok: true,
      reused: false,
      checkoutUrl: charge.paymentLinkUrl,
      contractId,
      paymentId,
    });
  } catch (error: any) {
    console.error("POST /api/aluno/checkout error:", error);

    // Nunca apaga a reserva aqui (ver fase 2 acima): uma falha depois que a
    // reserva local existe pode já ter tido efeito na Asaas, ou o resultado
    // pode estar incerto. A reserva permanece como âncora reconciliável; a
    // próxima tentativa do aluno retoma o mesmo contrato/pagamento em vez de
    // criar um novo, e resolveCheckoutCharge decide se reconcilia ou cria.

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
