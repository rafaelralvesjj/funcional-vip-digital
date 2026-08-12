import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";
import {
  classifyCareSignal,
  classifyTrainingPreference,
  registerTrainingPreferenceFromStudentMessage,
} from "@/lib/student-training-preferences";
import { buildWorkoutCompletionExperience } from "@/lib/student-experience";
import { getStudentDisplayName } from "@/lib/display-name";
import {
  expireOverduePendingWorkouts,
  releaseCurrentWeekPreplannedWorkouts,
} from "@/lib/workout-status-lifecycle";
import {
  canValidateWorkoutCivilDate,
  formatCivilKeyPtBr,
  getWorkoutValidationDeadlineCivilKey,
  workoutDateToCivilKey,
} from "@/lib/workout-validation-window";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

function isDateInCurrentValidationWeek(date: Date): boolean {
  return canValidateWorkoutCivilDate(workoutDateToCivilKey(date));
}

function getWorkoutValidationDeadlineLabel(date: Date | string): string {
  const workoutCivilKey = workoutDateToCivilKey(date);
  return formatCivilKeyPtBr(getWorkoutValidationDeadlineCivilKey(workoutCivilKey));
}

function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
  const contracted = Number(contractedTrainingDaysPerMonth || 0);

  if (!Number.isFinite(contracted) || contracted <= 0) {
    return null;
  }

  if (contracted <= 4) return 1;
  if (contracted <= 8) return 2;
  if (contracted <= 16) return 3;

  return Math.ceil(contracted / 4);
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function normalizeDateFromBody(value: unknown, fallback?: Date | null): Date {
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`);
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (fallback && !Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return new Date();
}


function getAppCareUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard/cuidado-aluno`;
}

function normalizeWorkoutCareEventType(value?: string | null): string | null {
  const eventType = String(value || "").trim().toUpperCase();

  if (!eventType) return null;

  const allowed = new Set([
    "FALTA_TEMPO",
    "EXERCICIO_DIFICIL",
    "DOR_DESCONFORTO",
    "NAO_ENTENDI",
    "DESMOTIVACAO",
    "BAIXA_ADERENCIA",
    "OUTRO",
    "PAUSA_POR_CUIDADO",
    "PREFERENCIA_TREINO",
  ]);

  return allowed.has(eventType) ? eventType : "OUTRO";
}

function textHasAnyKeyword(text: string, keywords: string[]): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return keywords.some((keyword) => normalized.includes(keyword));
}

function shouldTreatWorkoutCareAsPause(eventType: string | null, description?: string | null): boolean {
  if (eventType === "PAUSA_POR_CUIDADO") return true;

  const detail = String(description || "");

  const pauseKeywords = [
    "nao consigo treinar",
    "não consigo treinar",
    "nao consegui concluir",
    "não consegui concluir",
    "nao posso treinar",
    "não posso treinar",
    "me machuquei",
    "me acidentei",
    "acidente",
    "fui ao medico",
    "fui ao médico",
    "medico",
    "médico",
    "repouso",
    "gesso",
    "muleta",
    "fraturei",
    "fratura",
    "rompi",
    "ruptura",
    "nao consigo apoiar",
    "não consigo apoiar",
    "nao consigo andar",
    "não consigo andar",
    "travou",
    "travada",
    "dor forte",
    "muita dor",
    "inchado",
    "inchaço",
    "tontura",
    "falta de ar",
    "formigamento",
  ];

  return eventType === "DOR_DESCONFORTO" && textHasAnyKeyword(detail, pauseKeywords);
}

function getWorkoutCareCopy({
  eventType,
  studentName,
  professorName,
  description,
}: {
  eventType: string;
  studentName: string;
  professorName: string;
  description?: string | null;
}) {
  const detail = String(description || "").trim();

  const copies: Record<
    string,
    {
      severity: string;
      status: string;
      title: string;
      studentMessage: string;
      professorMessage: string;
    }
  > = {
    PAUSA_POR_CUIDADO: {
      severity: "CUIDADO",
      status: "REQUER_REVISAO",
      title: "Treino interrompido para cuidar de você",
      studentMessage: [
        `Oi, ${studentName}. Recebi seu relato e quero que você saiba que sua segurança vem primeiro.`,
        "O treino foi encerrado como interrompido por cuidado e não haverá liberação de um treino normal enquanto essa situação estiver aberta.",
        "Use o chat da plataforma para me contar como você está e quando se sentir apto para retomar. Vou revisar seu caso antes de qualquer nova orientação.",
        "Se houver dor forte, piora, limitação de movimento ou outro sinal importante, procure avaliação de um profissional de saúde.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de cuidado enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} informou que não conseguiu concluir o treino ou está sem condição de treinar. Faça contato pelo chat, registre a orientação e mantenha a liberação de treino normal bloqueada enquanto o evento estiver aberto. Quando o aluno sinalizar aptidão, revise uma retomada segura e oriente avaliação profissional quando necessário.`,
    },
    DOR_DESCONFORTO: {
      severity: "ALERTA",
      status: "ABERTO",
      title: "Seu relato de dor ou desconforto foi recebido",
      studentMessage: [
        `Oi, ${studentName}. Obrigado por registrar como você se sentiu.`,
        "Vou revisar esse relato antes de evoluir seu treino. Até lá, não force o movimento que gerou desconforto.",
        "Se a dor persistir, piorar ou limitar seus movimentos, procure avaliação de um profissional de saúde.",
        "Se precisar detalhar o que aconteceu, fale comigo pelo chat da plataforma.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de cuidado enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} concluiu o treino, mas relatou dor ou desconforto. Revise o relato pelo chat antes de evoluir carga, impacto, volume, complexidade ou intensidade.`,
    },
    EXERCICIO_DIFICIL: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Vamos ajustar o exercício que ficou difícil",
      studentMessage: [
        `Oi, ${studentName}. Obrigado por avisar que um exercício ficou difícil.`,
        "Essa informação me ajuda a ajustar carga, volume, explicação ou escolher uma variação mais adequada para você.",
        "Se puder, conte pelo chat qual exercício gerou dificuldade e em que momento isso aconteceu.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} informou dificuldade no treino. Revise pelo chat o exercício envolvido, a técnica, a carga, o volume e a necessidade de regressão antes da próxima montagem.`,
    },
    NAO_ENTENDI: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Vamos esclarecer seu treino",
      studentMessage: [
        `Oi, ${studentName}. Obrigado por contar que alguma parte do treino não ficou clara.`,
        "Não execute com dúvida. Fale comigo pelo chat da plataforma e me diga qual exercício ou orientação precisa de explicação.",
        "Vou revisar o conteúdo para deixar a execução mais simples e segura.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} informou que não entendeu o treino ou parte da execução. Responda pelo chat e revise descrição, imagens, observações e clareza das instruções antes da próxima montagem.`,
    },
    FALTA_TEMPO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos adaptar o treino à sua rotina",
      studentMessage: [
        `Oi, ${studentName}. Entendi que o tempo ficou apertado. Isso acontece e não precisa virar motivo para abandonar o processo.`,
        "Conte pelo chat como está sua rotina. Posso considerar duração, dias e formato dos próximos treinos para construir algo mais possível de cumprir.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} não concluiu o treino por falta de tempo. Faça uma abordagem pelo chat e avalie uma estratégia mais curta, objetiva e compatível com a rotina atual.`,
    },
    DESMOTIVACAO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos retomar sem pressão",
      studentMessage: [
        `Oi, ${studentName}. Obrigado por ser sincero sobre a falta de motivação.`,
        "Você não precisa recomeçar do zero nem compensar tudo de uma vez. Vamos pensar em um próximo passo menor e possível.",
        "Fale comigo pelo chat para eu entender seu momento e ajustar a retomada.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} sinalizou desmotivação e não concluiu o treino. Faça contato pelo chat com escuta, combine um próximo passo curto e considere uma semana de retomada com exercícios simples e reforço positivo.`,
    },
    BAIXA_ADERENCIA: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Vamos reorganizar sua rotina de treino",
      studentMessage: [
        `Oi, ${studentName}. Obrigado por registrar que não conseguiu manter o treino como planejado.`,
        "Essa informação vai ser usada para ajustar sua programação de forma mais realista, sem julgamento.",
        "Use o chat para me contar o que mais dificultou sua adesão.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} teve baixa aderência no treino. Antes de progredir, faça uma abordagem pelo chat e revise retomada, volume, complexidade e possíveis barreiras.`,
    },
    OUTRO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Obrigado por contar como foi seu treino",
      studentMessage: [
        `Oi, ${studentName}. Recebi sua observação e vou considerar esse contexto no seu acompanhamento.`,
        "Se quiser complementar o relato ou tirar alguma dúvida, fale comigo pelo chat da plataforma.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n"),
      professorMessage:
        `${studentName} registrou uma observação ao encerrar o treino. Revise o relato e, se necessário, faça contato pelo chat antes da próxima montagem.`,
    },
  };

  const selected = copies[eventType] || copies.OUTRO;

  if (!detail) return selected;

  return {
    ...selected,
    professorMessage: `${selected.professorMessage}\n\nRelato do aluno: ${detail}`,
  };
}

async function createWorkoutCareEvent({
  student,
  plan,
  workout,
  authorId,
  requestedEventType,
  description,
}: {
  student: any;
  plan: any;
  workout: any;
  authorId: string;
  requestedEventType: string;
  description?: string | null;
}) {
  const finalEventType = shouldTreatWorkoutCareAsPause(requestedEventType, description)
    ? "PAUSA_POR_CUIDADO"
    : requestedEventType;

  const copy = getWorkoutCareCopy({
    eventType: finalEventType,
    studentName: student.name || "Aluno",
    professorName: student.user?.name || "seu professor",
    description,
  });

  const week = getWeekRange(workout.date || plan.date || new Date());

  const careEvent = await prisma.studentCareEvent.create({
    data: {
      studentId: student.id,
      professorId: student.userId || null,
      authorId,
      contractId: workout.contractId || plan.contractId || null,
      eventType: finalEventType,
      severity: copy.severity,
      status: copy.status,
      source: "APP_ALUNO_ENCERRAMENTO_TREINO",
      title: copy.title,
      description: description || null,
      studentMessage: copy.studentMessage,
      professorMessage: copy.professorMessage,
      relatedWorkoutPlanId: plan.id,
      relatedWorkoutId: workout.id,
      weekStart: week.startOfWeek,
      weekEnd: week.endOfWeek,
    },
    select: {
      id: true,
      eventType: true,
      severity: true,
      status: true,
      title: true,
    },
  });

  await createStudentNotice({
    studentId: student.id,
    authorId,
    title: copy.title,
    content: copy.studentMessage,
    type: "CUIDADO_ALUNO",
    expiresAt: addDays(finalEventType === "PAUSA_POR_CUIDADO" ? 30 : 14),
  });

  if (student.userId) {
    await prisma.notice.create({
      data: {
        title:
          finalEventType === "PAUSA_POR_CUIDADO"
            ? `Ação de cuidado necessária com ${student.name}`
            : `Revisar relato de ${student.name}`,
        content: copy.professorMessage,
        type: "CUIDADO_ALUNO",
        authorId,
        studentId: student.id,
        professorId: student.userId,
        targetRole: "TEACHER",
        expiresAt: addDays(30),
      },
    });
  }

  if (finalEventType === "PAUSA_POR_CUIDADO" && student.user?.email) {
    try {
      await sendEmail({
        to: student.user.email,
        subject: `Ação de cuidado necessária: ${student.name}`,
        eventType: "WORKOUT_CARE_ACTION_TEACHER",
        recipientType: "TEACHER",
        contextId: student.id,
        text: [
          `Oi, ${student.user?.name || "professor(a)"}.`,
          "",
          copy.professorMessage,
          "",
          "Abra a Central de Cuidado, revise o relato e registre o encaminhamento antes de montar ou liberar novo treino.",
          getAppCareUrl(),
          "",
          "Gestão Funcional UP Digital",
          "Mensagem automática de segurança e acompanhamento.",
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
            <div style="max-width:620px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
              <h2 style="color:#00A19C;margin:0 0 16px;">Ação de cuidado necessária</h2>
              <p style="color:#f5f5f5;">Oi, <strong>${escapeHtml(student.user?.name || "professor(a)")}</strong>.</p>
              <p style="color:#d4d4d4;line-height:1.6;">${escapeHtml(copy.professorMessage).replaceAll("\n", "<br />")}</p>
              <p style="color:#d4d4d4;line-height:1.6;">Abra a Central de Cuidado, revise o relato e registre o encaminhamento antes de montar ou liberar novo treino.</p>
              <p><a href="${getAppCareUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">Abrir Central de Cuidado</a></p>
              <p style="color:#6b6b6b;font-size:11px;margin-top:20px;">Mensagem automática de segurança e acompanhamento.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de pausa por cuidado ao professor:", error);
    }
  }

  return careEvent;
}

async function createWorkoutPreferenceConversation({
  studentId,
  professorId,
  authorId,
  content,
  referenceDate,
}: {
  studentId: string;
  professorId: string | null;
  authorId: string;
  content: string;
  referenceDate: Date;
}) {
  const conversation = await prisma.question.create({
    data: {
      content,
      studentId,
      teacherId: professorId,
      parentId: null,
      senderRole: "STUDENT",
      answeredById: authorId,
    },
    select: {
      id: true,
    },
  });

  const preference = await registerTrainingPreferenceFromStudentMessage({
    sourceMessageId: conversation.id,
    sourceConversationId: conversation.id,
    studentId,
    professorId,
    content,
    source: "WORKOUT_COMPLETION",
    referenceDate,
  });

  return {
    conversationId: conversation.id,
    preference,
  };
}

async function getNoticeAuthorId(studentProfessorId?: string | null): Promise<string | null> {
  if (studentProfessorId) return studentProfessorId;

  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return gestor?.id || null;
}

async function getStudentEmail(student: {
  email?: string | null;
  userAuth?: { email?: string | null } | null;
}): Promise<string | null> {
  return student.email || student.userAuth?.email || null;
}

async function alreadySent({
  studentId,
  eventType,
  eventKey,
}: {
  studentId: string;
  eventType: string;
  eventKey: string;
}): Promise<boolean> {
  const existing = await prisma.workoutEngagementNotification.findFirst({
    where: {
      studentId,
      eventType,
      eventKey,
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

async function registerSent({
  studentId,
  workoutId,
  noticeId,
  eventType,
  eventKey,
  channel,
}: {
  studentId: string;
  workoutId?: string | null;
  noticeId?: string | null;
  eventType: string;
  eventKey: string;
  channel: string;
}) {
  try {
    await prisma.workoutEngagementNotification.create({
      data: {
        studentId,
        workoutId: workoutId || null,
        noticeId: noticeId || null,
        eventType,
        eventKey,
        channel,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") {
      throw error;
    }
  }
}

async function createStudentNotice({
  studentId,
  authorId,
  title,
  content,
  type = "ENGAJAMENTO_TREINO",
  expiresAt,
}: {
  studentId: string;
  authorId: string;
  title: string;
  content: string;
  type?: string;
  expiresAt?: Date | null;
}) {
  return prisma.notice.create({
    data: {
      title,
      content,
      type,
      targetRole: "ALUNO",
      studentId,
      authorId,
      expiresAt: expiresAt || null,
    },
    select: {
      id: true,
    },
  });
}

async function sendStudentEmail({
  to,
  studentName,
  professorName,
  subject,
  title,
  content,
}: {
  to: string | null;
  studentName: string;
  professorName?: string | null;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeProfessorName = escapeHtml(professorName || "seu professor");
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Oi, ${studentName}!`,
    "",
    content,
    "",
    `Ao concluir cada treino, registre no próprio treino qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma para falar com ${professorName || "seu professor"}. Esse relato influencia diretamente a montagem dos próximos treinos.`,
    "Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.",
    "",
    professorName || "Seu professor",
    "Funcional UP Digital",
    "Mensagem automática de acompanhamento enviada em nome do seu professor.",
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#00A19C; margin:0 0 16px;">${safeTitle}</h2>
        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">${safeContent}</p>
        <div style="background:#071413; border:1px solid #005D5A; border-radius:12px; padding:14px; margin:14px 0;">
          <p style="color:#00A19C; font-size:14px; font-weight:bold; margin:0 0 8px;">Seu relato orienta o próximo treino</p>
          <p style="color:#d4d4d4; font-size:13px; line-height:1.6; margin:0;">Ao concluir cada treino, registre no próprio treino qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma para falar com <strong>${safeProfessorName}</strong>. Esse relato influencia diretamente a montagem dos próximos treinos.</p>
        </div>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.</p>
        <a href="${alunoUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Acessar minha área</a>
        <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional UP Digital</p>
        <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de acompanhamento enviada em nome do seu professor.</p>
      </div>
    </div>
  `;

  await sendEmail({ to, subject, text, html, eventType: "WORKOUT_COMPLETION_STUDENT", recipientType: "STUDENT" });
  return true;
}

async function notifyWorkoutCompleted({
  student,
  workout,
  authorId,
  completedCountAfter,
}: {
  student: {
    id: string;
    name: string;
    preferredName?: string | null;
    email: string | null;
    userId: string | null;
    contractedTrainingDaysPerMonth: number | null;
    userAuth?: { email?: string | null } | null;
    user?: { name?: string | null } | null;
  };
  workout: {
    id: string;
    date: Date;
    workoutPlanId: string | null;
    contractId?: string | null;
  };
  authorId: string;
  completedCountAfter: number;
}) {
  const studentName = student.name || "Aluno";
  const studentEmail = await getStudentEmail(student);

  const isFirstCompletedWorkout = completedCountAfter === 1;
  const eventType = isFirstCompletedWorkout
    ? "FIRST_WORKOUT_COMPLETED"
    : "WORKOUT_COMPLETED";

  const eventKey = isFirstCompletedWorkout ? "FIRST" : workout.id;

  if (await alreadySent({ studentId: student.id, eventType, eventKey })) {
    return {
      eventType,
      sent: false,
      reason: "Já enviado",
    };
  }

  const professorName = student.user?.name || "seu professor";
  const title = isFirstCompletedWorkout
    ? "Seu primeiro treino foi concluído 👏"
    : "Mais um treino concluído 👏";

  const content = isFirstCompletedWorkout
    ? [
        `Parabéns, ${studentName}! Você concluiu seu primeiro treino no Funcional UP Digital.`,
        "",
        "Esse primeiro passo é importante porque começa a construir seu histórico real de acompanhamento.",
        "Continue registrando cada treino. Ao finalizar, informe no próprio treino qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Se precisar falar antes ou tiver dúvida sobre continuar, use o chat da plataforma. Esses relatos impactam diretamente a montagem dos próximos treinos.",
        "",
        "Vamos evoluir com constância e segurança, sem precisar acelerar além do seu momento.",
      ].join("\n")
    : [
        `Parabéns, ${studentName}! Mais um treino concluído e registrado.`,
        "",
        "Cada registro me ajuda a acompanhar sua rotina e decidir os próximos ajustes com mais contexto.",
        "Ao finalizar, registre no próprio treino qualquer incômodo, dor ou desconforto. Se precisar falar antes ou tiver dúvida sobre continuar, fale comigo pelo chat da plataforma. Seu relato será considerado nos próximos ajustes.",
      ].join("\n");

  const notice = await createStudentNotice({
    studentId: student.id,
    authorId,
    title,
    content,
    expiresAt: addDays(30),
  });

  let emailSent = false;

  if (isFirstCompletedWorkout) {
    try {
      emailSent = await sendStudentEmail({
        to: studentEmail,
        studentName,
        professorName,
        subject: title,
        title,
        content,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de primeiro treino concluído:", error);
    }
  }

  await registerSent({
    studentId: student.id,
    workoutId: workout.id,
    noticeId: notice.id,
    eventType,
    eventKey,
    channel: isFirstCompletedWorkout && emailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    eventType,
    sent: true,
    emailSent,
  };
}

async function notifyWeekCompletedIfNeeded({
  student,
  workoutDate,
  workoutId,
  authorId,
}: {
  student: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
    contractedTrainingDaysPerMonth: number | null;
    userAuth?: { email?: string | null } | null;
    user?: { name?: string | null } | null;
  };
  workoutDate: Date;
  workoutId: string;
  authorId: string;
}) {
  const weeklyLimit = getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth);

  if (!weeklyLimit) {
    return {
      sent: false,
      reason: "Aluno sem meta semanal configurada",
    };
  }

  const { startOfWeek, endOfWeek } = getWeekRange(workoutDate);
  const weekKey = startOfWeek.toISOString().slice(0, 10);

  if (await alreadySent({ studentId: student.id, eventType: "WEEK_100_COMPLETED", eventKey: weekKey })) {
    return {
      sent: false,
      reason: "Semana já reconhecida",
    };
  }

  const plannedCount = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...(workoutId ? {} : {}),
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  const workoutForContract = await prisma.workout.findUnique({
    where: {
      id: workoutId,
    },
    select: {
      contractId: true,
    },
  });

  const contractFilter = workoutForContract?.contractId
    ? {
        contractId: workoutForContract.contractId,
      }
    : {};

  const plannedCountInCycle = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...contractFilter,
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  const completedCount = await prisma.workout.count({
    where: {
      studentId: student.id,
      ...contractFilter,
      status: { in: ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"] },
      date: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
  });

  if (plannedCountInCycle < weeklyLimit || completedCount < weeklyLimit) {
    return {
      sent: false,
      reason: `Semana ainda não completa: ${completedCount}/${weeklyLimit}`,
    };
  }

  const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const professorName = student.user?.name || "seu professor";
  const title = "Você concluiu sua semana de treinos 🔥";
  const content = [
    `Parabéns, ${getStudentDisplayName(student)}! Você concluiu todos os treinos previstos para a semana de ${weekLabel}.`,
    "",
    "Mais do que cumprir uma lista, esse registro mostra uma rotina construída com constância.",
    "Vou usar essas informações para acompanhar sua evolução e revisar os próximos passos com segurança.",
    "Se quiser compartilhar como se sentiu durante a semana, fale comigo pelo chat da plataforma.",
  ].join("\n");

  const notice = await createStudentNotice({
    studentId: student.id,
    authorId,
    title,
    content,
    expiresAt: addDays(30),
  });

  let emailSent = false;

  try {
    emailSent = await sendStudentEmail({
      to: await getStudentEmail(student),
      studentName: getStudentDisplayName(student),
      professorName,
      subject: title,
      title,
      content,
    });
  } catch (error) {
    console.error("Erro ao enviar e-mail de semana concluída:", error);
  }

  await registerSent({
    studentId: student.id,
    workoutId,
    noticeId: notice.id,
    eventType: "WEEK_100_COMPLETED",
    eventKey: weekKey,
    channel: emailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    sent: true,
    emailSent,
    completedCount,
    weeklyLimit,
  };
}



function getAppEvolutionUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard/evolucao-alunos`;
}

function getEvolutionMilestone(completedCount: number): number | null {
  const count = Number(completedCount || 0);

  if (!Number.isFinite(count) || count <= 0) return null;
  if (count % 20 !== 0) return null;

  return count;
}

function buildEvolutionFeedbackDraft({
  studentName,
  professorName,
  milestone,
  completedCount,
}: {
  studentName: string;
  professorName: string;
  milestone: number;
  completedCount: number;
}): string {
  return [
    `Oi, ${studentName}!`,
    "",
    `Você chegou ao marco de ${milestone} treinos concluídos. Isso não é apenas um número: é um registro importante da sua constância e do caminho que estamos construindo juntos.`,
    "",
    "O que esse ciclo mostra:",
    `- ${completedCount} treino(s) concluído(s) e registrados;`,
    "- mais informações para eu entender sua rotina e sua resposta aos treinos;",
    "- uma base melhor para decidir manutenção, ajustes ou evolução com segurança.",
    "",
    "Para o próximo ciclo:",
    "- continue registrando cada treino com sinceridade;",
    "- use o chat para avisar sobre dor, desconforto, dificuldade ou dúvida;",
    "- respeite seu ritmo e não pule etapas para tentar compensar dias perdidos.",
    "",
    "Vou revisar seu histórico e preparar uma devolutiva mais individual sobre sua evolução.",
    "",
    professorName,
    "Funcional UP Digital",
  ].join("\n");
}

async function notifyEvolutionFeedbackMilestone({
  student,
  workout,
  authorId,
  completedCountAfter,
}: {
  student: {
    id: string;
    name: string;
    userId: string | null;
    user?: { id?: string | null; name?: string | null; email?: string | null } | null;
  };
  workout: {
    id: string;
    contractId?: string | null;
  };
  authorId: string;
  completedCountAfter: number;
}) {
  const milestone = getEvolutionMilestone(completedCountAfter);

  if (!milestone) {
    return {
      sent: false,
      reason: "Ainda não atingiu marco de 20 treinos.",
    };
  }

  const contractId = workout.contractId || null;
  const eventKey = contractId ? `${contractId}|${milestone}` : `GERAL|${milestone}`;

  if (await alreadySent({ studentId: student.id, eventType: "EVOLUTION_FEEDBACK_DUE", eventKey })) {
    return {
      sent: false,
      milestone,
      reason: "Marco de feedback já registrado.",
    };
  }

  const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM evolution_feedbacks
    WHERE student_id = ${student.id}
      AND milestone = ${milestone}
      AND (
        (${contractId}::text IS NULL AND contract_id IS NULL)
        OR contract_id = ${contractId}
      )
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    await registerSent({
      studentId: student.id,
      workoutId: workout.id,
      noticeId: null,
      eventType: "EVOLUTION_FEEDBACK_DUE",
      eventKey,
      channel: "SISTEMA",
    });

    return {
      sent: false,
      milestone,
      reason: "Feedback já existia na fila.",
    };
  }

  const draft = buildEvolutionFeedbackDraft({
    studentName: student.name || "Aluno",
    professorName: student.user?.name || "seu professor",
    milestone,
    completedCount: completedCountAfter,
  });

  const insertedRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO evolution_feedbacks (
      id,
      student_id,
      professor_id,
      milestone,
      status,
      completed_workouts_count,
      contract_id,
      draft,
      ready_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid()::text,
      ${student.id},
      ${student.userId},
      ${milestone},
      'PENDENTE_PROFESSOR',
      ${completedCountAfter},
      ${contractId},
      ${draft},
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  const evolutionFeedbackId = insertedRows[0]?.id || null;

  let professorNoticeId: string | null = null;

  if (student.userId) {
    const notice = await prisma.notice.create({
      data: {
        title: `Prepare a devolutiva de evolução de ${student.name}`,
        content: [
          `Oi, ${student.user?.name || "professor(a)"}.`,
          "",
          `${student.name} chegou ao marco de ${milestone} treinos concluídos.`,
          "Revise o histórico, a adesão, as dúvidas e os sinais de cuidado antes de enviar uma mensagem realmente individual ao aluno.",
          "O rascunho é apenas um ponto de partida: ajuste o texto para refletir o que você observou nesse ciclo e combine um próximo foco claro.",
          "",
          `Acesse a central de evolução: ${getAppEvolutionUrl()}`,
        ].join("\n"),
        type: "EVOLUTION_FEEDBACK_PENDING",
        authorId,
        studentId: student.id,
        professorId: student.userId,
        targetRole: "TEACHER",
        expiresAt: addDays(30),
      },
      select: {
        id: true,
      },
    });

    professorNoticeId = notice.id;

    if (evolutionFeedbackId) {
      await prisma.$executeRaw`
        UPDATE evolution_feedbacks
        SET professor_notice_id = ${professorNoticeId}, updated_at = NOW()
        WHERE id = ${evolutionFeedbackId}
      `;
    }
  }

  await registerSent({
    studentId: student.id,
    workoutId: workout.id,
    noticeId: professorNoticeId,
    eventType: "EVOLUTION_FEEDBACK_DUE",
    eventKey,
    channel: "AVISO_PROFESSOR",
  });

  if (student.user?.email) {
    try {
      await sendEmail({
        to: student.user.email,
        subject: `Evolução de ${student.name}: devolutiva para revisar`,
        eventType: "EVOLUTION_FEEDBACK_DUE_TEACHER",
        recipientType: "TEACHER",
        contextId: student.id,
        text: [
          `Oi, ${student.user?.name || "professor(a)"}.`,
          "",
          `${student.name} chegou ao marco de ${milestone} treinos concluídos.`,
          "Revise o histórico e personalize a devolutiva antes de enviar. O aluno deve perceber que a mensagem considera sua jornada real, não apenas o número de treinos.",
          "",
          `Abrir central de evolução: ${getAppEvolutionUrl()}`,
          "",
          "Gestão Funcional UP Digital",
          "Mensagem automática de acompanhamento.",
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;background:#0a0a0a;padding:24px;">
            <div style="max-width:620px;margin:0 auto;background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;">
              <h2 style="color:#00A19C;margin:0 0 16px;">Devolutiva de evolução para revisar</h2>
              <p style="color:#f5f5f5;">Oi, <strong>${escapeHtml(student.user?.name || "professor(a)")}</strong>.</p>
              <p style="color:#d4d4d4;line-height:1.6;"><strong>${escapeHtml(student.name)}</strong> chegou ao marco de <strong>${milestone} treinos concluídos</strong>.</p>
              <p style="color:#d4d4d4;line-height:1.6;">Revise o histórico e personalize a devolutiva antes de enviar. O aluno deve perceber que a mensagem considera sua jornada real, não apenas o número de treinos.</p>
              <p><a href="${getAppEvolutionUrl()}" style="display:inline-block;background:#00A19C;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">Abrir central de evolução</a></p>
              <p style="color:#6b6b6b;font-size:11px;margin-top:20px;">Mensagem automática de acompanhamento.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de feedback de evolução ao professor:", error);
    }
  }

  return {
    sent: true,
    milestone,
    evolutionFeedbackId,
    professorNoticeId,
  };
}

async function canAccessStudent({
  userId,
  userEmail,
  role,
  student,
}: {
  userId: string | null;
  userEmail: string | null;
  role: string;
  student: {
    userId: string | null;
    userAuthId: string | null;
    email: string | null;
  };
}) {
  if (!userId) return false;

  if (role === "GESTOR" || role === "ADMIN") return true;
  if (role === "TEACHER") return student.userId === userId;
  if (role === "STUDENT") {
    return student.userAuthId === userId || Boolean(userEmail && student.email === userEmail);
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.email ? String(sessionUser.email) : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));

    if (!studentId) {
      return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        userId: true,
        userAuthId: true,
        email: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      userEmail,
      role,
      student,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Corrige automaticamente qualquer treino da semana atual que tenha ficado
    // como PRE_PLANEJADO. Treinos de semanas futuras continuam ocultos.
    await releaseCurrentWeekPreplannedWorkouts({ studentId });
    await expireOverduePendingWorkouts({ studentId });

    const referenceMonth = Number.isFinite(month) && month >= 1 && month <= 12
      ? month
      : new Date().getMonth() + 1;
    const referenceYear = Number.isFinite(year) && year > 2000
      ? year
      : new Date().getFullYear();

    const start = new Date(referenceYear, referenceMonth - 1, 1);
    const end = new Date(referenceYear, referenceMonth, 1);

    const workouts = await prisma.workout.findMany({
      where: {
        studentId,
        date: {
          gte: start,
          lt: end,
        },
        ...(role === "STUDENT"
          ? { status: { notIn: ["PRE_PLANEJADO", "PRECISA_REVISAO"] } }
          : {}),
      },
      include: {
        workoutPlan: {
          select: {
            id: true,
            name: true,
            description: true,
            notes: true,
            date: true,
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json(workouts);
  } catch (error: any) {
    console.error("GET /api/workout/mark-complete error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const userEmail = sessionUser?.email ? String(sessionUser.email) : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const studentId = typeof body?.studentId === "string" ? body.studentId : null;
    const workoutPlanId = typeof body?.workoutPlanId === "string" ? body.workoutPlanId : null;
    const requestedCareEventType = normalizeWorkoutCareEventType(body?.careEventType);
    const careEventDescription = String(body?.careEventDescription || "").trim() || null;
    const requestedCompletionStatus = String(body?.completionStatus || "CONCLUIDO").toUpperCase();

    if (!studentId || !workoutPlanId) {
      return NextResponse.json(
        { error: "studentId e workoutPlanId são obrigatórios" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        preferredName: true,
        email: true,
        userId: true,
        userAuthId: true,
        contractedTrainingDaysPerMonth: true,
        userAuth: {
          select: {
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const hasAccess = await canAccessStudent({
      userId,
      userEmail,
      role,
      student,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    await expireOverduePendingWorkouts({ studentId });

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: workoutPlanId,
        studentId,
      },
      select: {
        id: true,
        date: true,
        name: true,
        contractId: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Treino não encontrado" }, { status: 404 });
    }

    /*
     * A data oficial para validação é a data planejada do treino.
     * O body.date fica apenas como fallback para treinos antigos sem data no plano.
     * Isso evita o aluno validar hoje um treino de outra semana e distorcer a adesão.
     */
    const workoutDate = normalizeDateFromBody(plan.date || body?.date, plan.date);

    if (!isDateInCurrentValidationWeek(workoutDate)) {
      return NextResponse.json(
        {
          error:
            `Prazo encerrado. Este treino só poderia ser concluído até 23h59 de ${getWorkoutValidationDeadlineLabel(workoutDate)}. Ele continua disponível apenas para consulta e será considerado não realizado.`,
          code: "VALIDATION_WINDOW_CLOSED",
        },
        { status: 403 }
      );
    }

    if (!["CONCLUIDO", "CONCLUIDO_PARCIALMENTE", "NAO_CONCLUIDO_COM_RELATO", "INTERROMPIDO_CUIDADO"].includes(requestedCompletionStatus)) {
      return NextResponse.json(
        { error: "Status de encerramento inválido." },
        { status: 400 }
      );
    }

    if (requestedCompletionStatus === "CONCLUIDO") {
      const dayStart = new Date(workoutDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [exerciseCount, completedExerciseCount] = await Promise.all([
        prisma.exercise.count({ where: { workoutPlanId } }),
        prisma.workoutExerciseProgress.count({
          where: {
            studentId,
            workoutPlanId,
            status: { in: ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"] },
            workoutDate: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      if (exerciseCount > 0 && completedExerciseCount < exerciseCount) {
        return NextResponse.json(
          {
            error: `Conclua todos os exercícios antes de finalizar o treino. Progresso atual: ${completedExerciseCount} de ${exerciseCount}.`,
            code: "EXERCISES_PENDING",
          },
          { status: 409 }
        );
      }
    }

    if (requestedCareEventType && !careEventDescription) {
      return NextResponse.json(
        { error: "Descreva em poucas palavras o que aconteceu antes de encerrar o treino com relato." },
        { status: 400 }
      );
    }

    const textCareClassification = careEventDescription
      ? classifyCareSignal(careEventDescription)
      : null;
    const textPreferenceClassification = careEventDescription
      ? classifyTrainingPreference(careEventDescription)
      : null;

    if (
      requestedCareEventType === "PREFERENCIA_TREINO" &&
      !textCareClassification?.hasSignal &&
      !textPreferenceClassification?.hasSignal
    ) {
      return NextResponse.json(
        {
          error:
            "Descreva uma preferência relacionada ao treino, por exemplo: exercícios que prefere, quer evitar, ambiente, rotina, musculação, cardio ou corrida.",
        },
        { status: 400 }
      );
    }

    const explicitSafetyReport =
      requestedCareEventType === "DOR_DESCONFORTO" ||
      requestedCareEventType === "PAUSA_POR_CUIDADO";

    const shouldRegisterTrainingPreference = Boolean(
      careEventDescription &&
      textPreferenceClassification?.hasSignal &&
      !textCareClassification?.hasSignal &&
      !explicitSafetyReport
    );

    const preferenceOnlyReport = Boolean(
      shouldRegisterTrainingPreference &&
      (requestedCareEventType === "PREFERENCIA_TREINO" || requestedCareEventType === "OUTRO")
    );

    const careEventTypeFromText = textCareClassification?.hasSignal
      ? textCareClassification.requiresTrainingPause
        ? "PAUSA_POR_CUIDADO"
        : "DOR_DESCONFORTO"
      : requestedCareEventType;

    const shouldPauseForCare = shouldTreatWorkoutCareAsPause(
      careEventTypeFromText,
      careEventDescription
    );

    const finalCareEventType = preferenceOnlyReport
      ? null
      : shouldPauseForCare
        ? "PAUSA_POR_CUIDADO"
        : careEventTypeFromText === "PREFERENCIA_TREINO"
          ? null
          : careEventTypeFromText;

    let workoutStatus = "CONCLUIDO";

    if (shouldPauseForCare || requestedCompletionStatus === "INTERROMPIDO_CUIDADO") {
      workoutStatus = "INTERROMPIDO_CUIDADO";
    } else if (requestedCompletionStatus === "CONCLUIDO_PARCIALMENTE") {
      workoutStatus = "CONCLUIDO_PARCIALMENTE";
    } else if (requestedCompletionStatus === "NAO_CONCLUIDO_COM_RELATO") {
      workoutStatus = "NAO_CONCLUIDO_COM_RELATO";
    }

    const authorId = await getNoticeAuthorId(student.userId);

    if (!authorId) {
      return NextResponse.json(
        { error: "Nenhum autor encontrado para criar aviso" },
        { status: 400 }
      );
    }

    const existingWorkout = await prisma.workout.findFirst({
      where: {
        studentId,
        workoutPlanId,
      },
      select: {
        id: true,
        status: true,
        contractId: true,
      },
    });

    const workoutPlanForContract = await prisma.workoutPlan.findUnique({
      where: {
        id: workoutPlanId,
      },
      select: {
        contractId: true,
      },
    });

    const workout = existingWorkout
      ? await prisma.workout.update({
          where: { id: existingWorkout.id },
          data: {
            status: workoutStatus,
            date: workoutDate,
            contractId: existingWorkout.contractId || workoutPlanForContract?.contractId || null,
          },
          select: {
            id: true,
            studentId: true,
            workoutPlanId: true,
            contractId: true,
            date: true,
            status: true,
          },
        })
      : await prisma.workout.create({
          data: {
            studentId,
            workoutPlanId,
            contractId: workoutPlanForContract?.contractId || null,
            date: workoutDate,
            status: workoutStatus,
          },
          select: {
            id: true,
            studentId: true,
            workoutPlanId: true,
            contractId: true,
            date: true,
            status: true,
          },
        });

    let careEvent: any = null;

    if (finalCareEventType) {
      careEvent = await createWorkoutCareEvent({
        student,
        plan,
        workout,
        authorId,
        requestedEventType: finalCareEventType,
        description: careEventDescription,
      });
    }

    let trainingPreference: any = null;

    if (shouldRegisterTrainingPreference && careEventDescription) {
      trainingPreference = await createWorkoutPreferenceConversation({
        studentId: student.id,
        professorId: student.userId || null,
        authorId: userId,
        content: careEventDescription,
        referenceDate: workoutDate,
      });
    }

    let completedCountAfter = 0;

    let completionNotification: any = {
      sent: false,
      reason: "Treino encerrado sem conclusão.",
    };

    let weekNotification: any = {
      sent: false,
      reason: "Treino não concluído; semana não reconhecida como completa.",
    };

    if (["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"].includes(workoutStatus)) {
      completedCountAfter = await prisma.workout.count({
        where: {
          studentId,
          status: { in: ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"] },
          ...(workout.contractId ? { contractId: workout.contractId } : {}),
        },
      });

      completionNotification = await notifyWorkoutCompleted({
        student,
        workout,
        authorId,
        completedCountAfter,
      });

      weekNotification = await notifyWeekCompletedIfNeeded({
        student,
        workoutDate,
        workoutId: workout.id,
        authorId,
      });
    }

    let evolutionFeedbackNotification: any = {
      sent: false,
      reason: "Treino não gerou marco de feedback evolutivo.",
    };

    if (["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"].includes(workoutStatus)) {
      const completedCountAfterForEvolution = await prisma.workout.count({
        where: {
          studentId,
          status: { in: ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"] },
          ...(workout.contractId ? { contractId: workout.contractId } : {}),
        },
      });

      evolutionFeedbackNotification = await notifyEvolutionFeedbackMilestone({
        student,
        workout,
        authorId,
        completedCountAfter: completedCountAfterForEvolution,
      });
    }

    const [doneExerciseCount, skippedExerciseCount] = await Promise.all([
      prisma.workoutExerciseProgress.count({
        where: {
          studentId,
          workoutPlanId,
          status: "CONCLUIDO",
        },
      }),
      prisma.workoutExerciseProgress.count({
        where: {
          studentId,
          workoutPlanId,
          status: "PULADO",
        },
      }),
    ]);

    const completionExperience =
      ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"].includes(workoutStatus)
        ? buildWorkoutCompletionExperience({
            studentName: student.preferredName || student.name,
            partial: workoutStatus === "CONCLUIDO_PARCIALMENTE",
            done: doneExerciseCount,
            skipped: skippedExerciseCount,
            completedCount: completedCountAfter,
            weekCompleted: Boolean(weekNotification?.sent),
          })
        : null;

    const responseMessage = trainingPreference?.preference
      ? trainingPreference.preference.currentWeekAction === "PENDING"
        ? "Treino registrado e preferência enviada ao professor. Existe outro treino pendente nesta semana que poderá ser revisado antes da execução."
        : "Treino registrado e preferência salva para os próximos planejamentos."
      : finalCareEventType === "PAUSA_POR_CUIDADO"
        ? "Seu relato foi recebido com atenção. O treino foi interrompido por cuidado e seu professor vai revisar a situação antes de qualquer retomada."
        : finalCareEventType
          ? workoutStatus === "CONCLUIDO"
            ? "Treino concluído e relato enviado ao seu professor para acompanhamento."
            : workoutStatus === "CONCLUIDO_PARCIALMENTE"
              ? "Treino concluído parcialmente e contabilizado. Seu relato foi enviado ao professor para ajustar os próximos treinos."
              : "Treino encerrado e relato enviado ao seu professor para acompanhamento."
          : workoutStatus === "CONCLUIDO_PARCIALMENTE"
            ? "Treino concluído parcialmente e contabilizado."
            : "Treino concluído e registrado. Parabéns por mais esse passo!";

    return NextResponse.json({
      ok: true,
      workout,
      careEvent,
      trainingPreference,
      message: responseMessage,
      completionExperience,
      notifications: {
        completion: completionNotification,
        week: weekNotification,
        evolutionFeedback: evolutionFeedbackNotification,
      },
    });
  } catch (error: any) {
    console.error("POST /api/workout/mark-complete error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

