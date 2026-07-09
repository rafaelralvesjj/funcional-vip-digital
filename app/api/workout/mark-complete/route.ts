import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

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
    "https://funcional-vip-digital.vercel.app";

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
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);

  const currentWeek = getWeekRange(new Date());

  return normalized >= currentWeek.startOfWeek && normalized < currentWeek.endOfWeek;
}

function getCurrentValidationDeadlineLabel(): string {
  const currentWeek = getWeekRange(new Date());
  const deadline = new Date(currentWeek.endOfWeek);
  deadline.setDate(deadline.getDate() - 1);

  return formatDatePtBr(deadline);
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
    "https://funcional-vip-digital.vercel.app";

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
  description,
}: {
  eventType: string;
  studentName: string;
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
      title: "Pausa por cuidado: aluno sem condição de treinar",
      studentMessage:
        "Recebemos seu relato. Sua segurança vem primeiro. O treino foi encerrado como interrompido por cuidado, e o professor foi sinalizado para revisar antes de qualquer retomada.",
      professorMessage:
        `${studentName} sinalizou que não conseguiu concluir o treino ou está sem condição de treinar. Não liberar treino normal enquanto este evento estiver aberto. Oriente avaliação profissional quando necessário e revise a retomada segura quando o aluno informar aptidão.`,
    },
    DOR_DESCONFORTO: {
      severity: "ALERTA",
      status: "ABERTO",
      title: "Relato de dor/desconforto no encerramento do treino",
      studentMessage:
        "Recebemos seu relato de dor ou desconforto. O professor foi sinalizado para revisar a próxima prescrição. Se a dor persistir, piorar ou limitar seus movimentos, procure avaliação de um profissional de saúde.",
      professorMessage:
        `${studentName} concluiu o treino, mas relatou dor ou desconforto. Revise antes de evoluir carga, impacto, volume, complexidade ou intensidade.`,
    },
    EXERCICIO_DIFICIL: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Treino encerrado com exercício difícil",
      studentMessage:
        "Recebemos seu relato. O professor foi sinalizado para revisar carga, exercício, volume ou uma variação mais adequada.",
      professorMessage:
        `${studentName} informou dificuldade no treino. Revise complexidade, carga, volume, instruções e possível regressão antes da próxima montagem.`,
    },
    NAO_ENTENDI: {
      severity: "REVISAO",
      status: "REQUER_REVISAO",
      title: "Treino encerrado por falta de entendimento",
      studentMessage:
        "Recebemos seu relato. O professor foi sinalizado para revisar a explicação e te ajudar a executar com mais segurança.",
      professorMessage:
        `${studentName} informou que não entendeu o treino ou parte da execução. Revise descrição, observações e clareza das instruções antes da próxima montagem.`,
    },
    FALTA_TEMPO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Treino não concluído por falta de tempo",
      studentMessage:
        "Recebemos seu relato. Rotina corrida acontece. O professor vai considerar isso para ajustar sua próxima semana com mais aderência e realidade.",
      professorMessage:
        `${studentName} não concluiu o treino por falta de tempo. Avalie uma estratégia mais simples, objetiva e possível de cumprir.`,
    },
    DESMOTIVACAO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Treino não concluído por desmotivação",
      studentMessage:
        "Recebemos seu relato. A motivação oscila, mas você não precisa recomeçar do zero. O professor vai considerar uma retomada mais leve e possível.",
      professorMessage:
        `${studentName} sinalizou desmotivação e não concluiu o treino. Considere uma semana de retomada com metas curtas, exercícios simples e reforço positivo.`,
    },
    BAIXA_ADERENCIA: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Baixa aderência registrada no treino",
      studentMessage:
        "Recebemos seu relato. Vamos usar essa informação para ajustar melhor sua próxima programação.",
      professorMessage:
        `${studentName} teve baixa aderência no treino. Antes de progredir, avalie retomada, volume, complexidade e possíveis barreiras.`,
    },
    OUTRO: {
      severity: "ATENCAO",
      status: "ABERTO",
      title: "Treino encerrado com relato do aluno",
      studentMessage:
        "Recebemos seu relato. Sua resposta ajuda o professor a cuidar melhor da sua rotina e ajustar o treino de forma mais humana e realista.",
      professorMessage:
        `${studentName} registrou uma observação ao encerrar o treino. Revise o contexto antes da próxima montagem.`,
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
            ? `Pausa por cuidado: ${student.name}`
            : `Revisar treino: ${student.name}`,
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
        subject: `Pausa por cuidado: ${student.name}`,
        text: [
          `Olá, ${student.user?.name || "professor(a)"}.`,
          "",
          copy.professorMessage,
          "",
          "Antes de montar ou liberar novo treino, revise a Central de Cuidado do Aluno.",
          getAppCareUrl(),
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
            <p>Olá, ${escapeHtml(student.user?.name || "professor(a)")}.</p>
            <p>${escapeHtml(copy.professorMessage).replaceAll("\n", "<br />")}</p>
            <p>Antes de montar ou liberar novo treino, revise a Central de Cuidado do Aluno.</p>
            <p><a href="${getAppCareUrl()}">Abrir Central de Cuidado</a></p>
          </div>
        `,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de pausa por cuidado ao professor:", error);
    }
  }

  return careEvent;
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
  subject,
  title,
  content,
}: {
  to: string | null;
  studentName: string;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Olá, ${studentName}!`,
    "",
    content,
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${safeTitle}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${safeStudentName}</strong>!
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${safeContent}
        </p>

        <a href="${alunoUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Acessar minha área
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
          Este é um aviso automático do Funcional Vip Digital.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    text,
    html,
  });

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
    email: string | null;
    userId: string | null;
    contractedTrainingDaysPerMonth: number | null;
    userAuth?: { email?: string | null } | null;
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

  const title = isFirstCompletedWorkout
    ? "Primeiro treino concluído! 👏"
    : "Treino concluído! 👏";

  const content = isFirstCompletedWorkout
    ? [
        "Parabéns por concluir seu primeiro treino no Funcional Vip Digital!",
        "",
        "Esse é um marco importante da sua jornada. A constância é o que transforma treino em evolução.",
        "",
        "Continue registrando seus treinos para que seu professor consiga acompanhar seu progresso com mais precisão.",
      ].join("\n")
    : [
        "Parabéns, treino concluído!",
        "",
        "Você deu mais um passo importante no seu objetivo. Cada treino registrado ajuda seu acompanhamento e fortalece sua evolução.",
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
      status: "CONCLUIDO",
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

  const title = "Semana concluída com sucesso! 🔥";
  const content = [
    "Parabéns! Você concluiu todos os treinos previstos para esta semana.",
    "",
    `Semana de referência: ${weekLabel}.`,
    "",
    "Esse nível de constância faz diferença no seu resultado. Continue registrando seus treinos e mantendo sua rotina ativa.",
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
      studentName: student.name || "Aluno",
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
    "https://funcional-vip-digital.vercel.app";

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
  milestone,
  completedCount,
}: {
  studentName: string;
  milestone: number;
  completedCount: number;
}): string {
  return [
    `Olá, ${studentName}!`,
    "",
    `Você completou ${milestone} treinos executados no Funcional VIP Digital. Esse é um marco importante, porque evolução de verdade nasce da constância e do cuidado com o processo.`,
    "",
    "O que observamos neste ciclo:",
    `- Você registrou ${completedCount} treino(s) concluído(s).`,
    "- Cada treino registrado ajuda o professor a entender melhor sua rotina, sua adesão e os ajustes necessários.",
    "- A continuidade é um sinal positivo para seguirmos evoluindo com segurança.",
    "",
    "Pontos para o próximo ciclo:",
    "- Continue registrando seus treinos com sinceridade.",
    "- Avise sempre que sentir dor, desconforto, dificuldade ou falta de clareza na execução.",
    "- O professor vai usar essas informações para ajustar volume, intensidade, exercícios e progressão.",
    "",
    "Próximo passo: seguir com consistência, técnica e atenção ao corpo. Estamos acompanhando sua evolução de perto.",
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
        title: `Feedback de evolução pendente: ${milestone} treinos`,
        content: [
          `${student.name} completou ${milestone} treinos concluídos.`,
          "",
          "Revise o histórico, ajustes, dúvidas, sinais de cuidado e envie uma devolutiva humanizada ao aluno.",
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
        subject: `Feedback de evolução pendente: ${student.name}`,
        text: [
          `Olá, ${student.user?.name || "professor(a)"}.`,
          "",
          `${student.name} completou ${milestone} treinos concluídos.`,
          "Revise e envie uma devolutiva de evolução para o aluno.",
          "",
          getAppEvolutionUrl(),
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
            <p>Olá, ${escapeHtml(student.user?.name || "professor(a)")}.</p>
            <p><strong>${escapeHtml(student.name)}</strong> completou <strong>${milestone} treinos concluídos</strong>.</p>
            <p>Revise e envie uma devolutiva de evolução para o aluno.</p>
            <p><a href="${getAppEvolutionUrl()}">Abrir central de evolução</a></p>
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
            `Prazo de validação encerrado. O treino só pode ser validado na própria semana, até domingo (${getCurrentValidationDeadlineLabel()}).`,
          code: "VALIDATION_WINDOW_CLOSED",
        },
        { status: 403 }
      );
    }

    if (!["CONCLUIDO", "NAO_CONCLUIDO_COM_RELATO", "INTERROMPIDO_CUIDADO"].includes(requestedCompletionStatus)) {
      return NextResponse.json(
        { error: "Status de encerramento inválido." },
        { status: 400 }
      );
    }

    if (requestedCareEventType && !careEventDescription) {
      return NextResponse.json(
        { error: "Descreva em poucas palavras o que aconteceu antes de encerrar o treino com relato." },
        { status: 400 }
      );
    }

    const shouldPauseForCare = shouldTreatWorkoutCareAsPause(requestedCareEventType, careEventDescription);
    const finalCareEventType = shouldPauseForCare ? "PAUSA_POR_CUIDADO" : requestedCareEventType;

    let workoutStatus = "CONCLUIDO";

    if (shouldPauseForCare || requestedCompletionStatus === "INTERROMPIDO_CUIDADO") {
      workoutStatus = "INTERROMPIDO_CUIDADO";
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

    let completionNotification: any = {
      sent: false,
      reason: "Treino encerrado sem conclusão.",
    };

    let weekNotification: any = {
      sent: false,
      reason: "Treino não concluído; semana não reconhecida como completa.",
    };

    if (workoutStatus === "CONCLUIDO") {
      const completedCountAfter = await prisma.workout.count({
        where: {
          studentId,
          status: "CONCLUIDO",
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

    if (workoutStatus === "CONCLUIDO") {
      const completedCountAfterForEvolution = await prisma.workout.count({
        where: {
          studentId,
          status: "CONCLUIDO",
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

    const responseMessage = finalCareEventType === "PAUSA_POR_CUIDADO"
      ? "Recebemos seu relato. O treino foi encerrado como interrompido por cuidado, e o professor foi sinalizado antes de qualquer retomada."
      : finalCareEventType
        ? workoutStatus === "CONCLUIDO"
          ? "Treino concluído com relato enviado ao professor."
          : "Treino encerrado com relato enviado ao professor."
        : "Treino concluído!";

    return NextResponse.json({
      ok: true,
      workout,
      careEvent,
      message: responseMessage,
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
