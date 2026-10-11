import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  verifyAsaasWebhookToken,
  normalizeAsaasWebhookEvent,
  AsaasWebhookConfigError,
  type AsaasWebhookPayload,
} from "@/lib/asaas-webhook";
import { processAsaasWebhookEvent, isRetriableWebhookReason } from "@/lib/asaas-webhook-processor";

export const dynamic = "force-dynamic";

const PROVIDER = "ASAAS";

/**
 * Sinaliza um resultado "ainda não dá pra processar" (ex.: o webhook chegou
 * antes da nossa própria persistência do checkout terminar) — nunca marcamos
 * o WebhookEvent como processado nesse caso, e devolvemos um status que leva
 * a Asaas a reentregar o evento mais tarde. Perder silenciosamente um
 * desses significaria um pagamento confirmado que nunca ativa o contrato.
 */
class RetriableWebhookError extends Error {}

/**
 * Fonte de verdade da ativação de contratos pagos: só este webhook (nunca a
 * página de redirect/sucesso do checkout) marca um pagamento como PAGO e
 * aciona a transição EM_ABERTO -> PAGO. Idempotente via WebhookEvent
 * (provider, eventId) e transacional (prisma.$transaction) para nunca
 * deixar ContractPayment/StudentContract parcialmente atualizados.
 */
export async function POST(req: NextRequest) {
  let verified: boolean;

  try {
    verified = verifyAsaasWebhookToken(req.headers.get("asaas-access-token"));
  } catch (error) {
    if (error instanceof AsaasWebhookConfigError) {
      console.error("Webhook Asaas rejeitado: ASAAS_WEBHOOK_TOKEN não configurado.");
      return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
    }
    throw error;
  }

  if (!verified) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const normalized = normalizeAsaasWebhookEvent(payload);

  try {
    let eventRow = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: PROVIDER, eventId: normalized.eventId } },
    });

    if (eventRow?.processedAt) {
      // Evento já processado antes — idempotente, não refaz nada.
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (!eventRow) {
      try {
        eventRow = await prisma.webhookEvent.create({
          data: {
            provider: PROVIDER,
            eventId: normalized.eventId,
            eventType: normalized.eventType,
            payload: payload as any,
          },
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          // Corrida: outra entrega concorrente já criou a linha entre o
          // findUnique e o create acima. Recarrega e decide com base nela.
          eventRow = await prisma.webhookEvent.findUnique({
            where: { provider_eventId: { provider: PROVIDER, eventId: normalized.eventId } },
          });

          if (eventRow?.processedAt) {
            return NextResponse.json({ ok: true, duplicate: true });
          }
        } else {
          throw error;
        }
      }
    }

    if (!eventRow) {
      throw new Error("Falha ao registrar evento de webhook para idempotência.");
    }

    const eventRowId = eventRow.id;

    await prisma.$transaction(async (tx) => {
      const result = await processAsaasWebhookEvent(tx as any, normalized);

      if (!result.handled) {
        if (isRetriableWebhookReason(result.reason)) {
          // Não marca processedAt: a linha de WebhookEvent fica pendente e
          // uma reentrega da Asaas (ou uma nova entrega com o mesmo
          // payload.id) vai encontrá-la e tentar de novo. Lança para
          // abortar esta transação (nada mais foi escrito) sem perder o
          // evento.
          throw new RetriableWebhookError(
            `Webhook Asaas ainda não aplicável (${normalized.eventType}): ${result.reason}.`
          );
        }

        console.warn(`Webhook Asaas ignorado (${normalized.eventType}): ${result.reason}.`);
      }

      await tx.webhookEvent.update({
        where: { id: eventRowId },
        data: { processedAt: new Date() },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof RetriableWebhookError) {
      console.warn("POST /api/webhooks/asaas: evento pendente, pedindo reentrega:", error.message);
      return NextResponse.json(
        { error: "Registro local ainda não disponível. Reenvie este webhook em instantes." },
        { status: 503 }
      );
    }

    console.error("POST /api/webhooks/asaas error:", error);
    return NextResponse.json({ error: "Erro ao processar webhook." }, { status: 500 });
  }
}
