import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { resolveStudentRecipientEmail } from "@/lib/email-recipient-policy";
import {
  NIGHTLY_WORKOUT_REMINDER_EVENT,
  buildNightlyWorkoutReminderMessage,
  getNightlyWorkoutReminderWindow,
  shouldSendNightlyWorkoutReminder,
} from "@/lib/workout-nightly-reminder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const CARE_EVENTS = [
  "PAUSA_BAIXA_ADERENCIA",
  "PAUSA_POR_CUIDADO",
  "DOR_DESCONFORTO",
  "EXERCICIO_DIFICIL",
  "NAO_ENTENDI",
  "FALTA_TEMPO",
  "DESMOTIVACAO",
  "OUTRO",
];

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtml(content: string, studentUrl: string): string {
  return `<div style="background:#0a0a0a;padding:24px;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:auto;background:#111;border:1px solid #333;border-radius:16px;padding:26px;">
    <h2 style="color:#00A19C;">Seu treino ainda está te esperando 💪</h2>
    <p style="color:#e5e5e5;line-height:1.7;white-space:pre-line;">${escapeHtml(content)}</p>
    <a href="${escapeHtml(studentUrl)}" style="display:inline-block;margin-top:18px;border-radius:10px;background:#00A19C;padding:12px 18px;color:#0a0a0a;text-decoration:none;font-weight:bold;">Acessar meu treino</a>
    <p style="font-size:11px;color:#999;margin-top:24px;">Lembrete automático enviado às 21h no horário de Brasília. A ausência de conclusão no aplicativo não significa necessariamente que você não treinou.</p>
  </div></div>`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Em Preview não disparamos e-mails reais; testar apenas os helpers/build.
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: true, paused: true, reason: "Somente produção envia lembretes" });
  }

  const window = getNightlyWorkoutReminderWindow(new Date());
  if (!window.allowedToSend) {
    return NextResponse.json({ ok: true, skipped: "Fora da janela de 21h de Brasília", localHour: window.localHour });
  }

  const workouts = await prisma.workout.findMany({
    where: {
      date: { gte: window.start, lt: window.end },
      status: "PENDENTE",
      workoutPlan: { active: true },
      student: {
        active: true,
        contracts: {
          some: {
            status: "ACTIVE",
            startDate: { lt: window.end },
            endDate: { gte: window.start },
          },
        },
      },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      workoutPlan: { select: { name: true } },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userAuthId: true,
          userAuth: { select: { active: true, role: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const results: Array<{ workoutId: string; sent: boolean; reason?: string }> = [];
  const errors: Array<{ workoutId: string; message: string }> = [];
  const studentIdsWithEmail = new Set<string>();
  const studentUrl = `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://funcional-vip-digital.vercel.app").replace(/\/$/, "")}/aluno`;

  for (const workout of workouts) {
    const student = workout.student;
    const eventKey = workout.id;
    const uniqueWhere = {
      studentId_eventType_eventKey: {
        studentId: workout.studentId,
        eventType: NIGHTLY_WORKOUT_REMINDER_EVENT,
        eventKey,
      },
    };

    try {
      // Um e-mail no máximo por aluno/dia, mesmo se houver mais de um treino.
      if (studentIdsWithEmail.has(workout.studentId)) {
        results.push({ workoutId: workout.id, sent: false, reason: "Aluno já notificado nesta execução" });
        continue;
      }

      if (student.userAuth?.active === false ||
          String(student.userAuth?.role || "").toUpperCase() !== "ALUNO") {
        results.push({ workoutId: workout.id, sent: false, reason: "Sem conta ALUNO ativa vinculada" });
        continue;
      }

      const careOpen = await prisma.studentCareEvent.findFirst({
        where: {
          studentId: workout.studentId,
          status: { not: "RESOLVIDO" },
          eventType: { in: CARE_EVENTS },
        },
        select: { id: true },
      });
      if (careOpen) {
        results.push({ workoutId: workout.id, sent: false, reason: "Acompanhamento de cuidado aberto" });
        continue;
      }

      const to = await resolveStudentRecipientEmail({
        studentId: student.id,
        studentEmail: student.email,
        userAuthId: student.userAuthId,
      });
      if (!to) {
        results.push({ workoutId: workout.id, sent: false, reason: "E-mail seguro de aluno não encontrado" });
        continue;
      }

      // Reconsulta imediatamente antes do disparo para não enviar a quem acabou de concluir.
      const latest = await prisma.workout.findUnique({
        where: { id: workout.id },
        select: { status: true, workoutPlan: { select: { active: true } } },
      });
      if (!shouldSendNightlyWorkoutReminder(latest?.status) || !latest?.workoutPlan?.active) {
        results.push({ workoutId: workout.id, sent: false, reason: "Treino já concluído ou não liberado" });
        continue;
      }

      // Reserva idempotente ANTES do e-mail: duas instâncias do cron não duplicam.
      // Reutiliza a constraint existente; nenhuma migration é necessária.
      try {
        await prisma.workoutEngagementNotification.create({
          data: {
            studentId: workout.studentId,
            workoutId: workout.id,
            eventType: NIGHTLY_WORKOUT_REMINDER_EVENT,
            eventKey,
            channel: "EMAIL",
          },
        });
      } catch (claimError: any) {
        if (claimError?.code === "P2002") {
          results.push({ workoutId: workout.id, sent: false, reason: "Lembrete já enviado ou reservado" });
          studentIdsWithEmail.add(workout.studentId);
          continue;
        }
        throw claimError;
      }

      const message = buildNightlyWorkoutReminderMessage(student.name, workout.workoutPlan?.name || "seu treino");
      try {
        await sendEmail({
          to,
          subject: message.subject,
          text: `${message.content}\n\nAcesse: ${studentUrl}\n\nLembrete automático de acompanhamento.`,
          html: buildHtml(message.content, studentUrl),
          eventType: NIGHTLY_WORKOUT_REMINDER_EVENT,
          recipientType: "STUDENT",
          contextId: workout.studentId,
        });
        studentIdsWithEmail.add(workout.studentId);
        results.push({ workoutId: workout.id, sent: true });
      } catch (sendError) {
        // SMTP falhou: solta a reserva para retry. Não alteramos o treino.
        await prisma.workoutEngagementNotification.delete({ where: uniqueWhere });
        throw sendError;
      }
    } catch (error: any) {
      errors.push({ workoutId: workout.id, message: error?.message || "Erro desconhecido" });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    civilDate: window.civilDate,
    totals: {
      workoutsEvaluated: workouts.length,
      remindersSent: results.filter((item) => item.sent).length,
      skipped: results.filter((item) => !item.sent).length,
      errors: errors.length,
    },
    // Não expor nome/e-mail no resultado do cron.
    results,
    errors,
  });
}
