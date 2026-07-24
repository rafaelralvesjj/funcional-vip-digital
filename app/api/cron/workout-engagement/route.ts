import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type StudentForEngagement = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  userAuth?: {
    email: string | null;
    role: string | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string | null;
  } | null;
};

type WorkoutForEngagement = {
  id: string;
  studentId: string;
  workoutPlanId: string | null;
  date: Date;
  status: string;
  student: StudentForEngagement;
  workoutPlan?: {
    id: string;
    name: string;
  } | null;
};

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function getAppDashboardUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function getTodayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
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

async function getNoticeAuthorId(): Promise<string | null> {
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

function getStudentEmail(student: StudentForEngagement): string | null {
  const linkedRole = String(student.userAuth?.role || "").toUpperCase();

  if (linkedRole !== "ALUNO") {
    console.warn(
      `[workout-engagement] E-mail não enviado: cadastro ${student.id} não possui usuário ALUNO vinculado.`
    );
    return null;
  }

  return student.userAuth?.email?.trim() || null;
}

type StudentCommunicationIdentity = {
  authorId: string;
  senderName: string;
  senderRoleLabel: "Professor" | "Gestão";
  senderImage: string | null;
  sentByProfessor: boolean;
};

function getInitials(name?: string | null): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "FV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getSafeRemoteImageUrl(value?: string | null): string | null {
  const imageUrl = String(value || "").trim();
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : null;
}

function buildEmailAvatarHtml(name: string, image?: string | null): string {
  const safeName = escapeHtml(name);
  const safeImageUrl = getSafeRemoteImageUrl(image);

  if (safeImageUrl) {
    return `
      <img
        src="${escapeHtml(safeImageUrl)}"
        width="48"
        height="48"
        alt="Foto de ${safeName}"
        style="display:block; width:48px; height:48px; border-radius:999px; object-fit:cover; border:1px solid #D4A373;"
      />
    `;
  }

  return `
    <div style="width:48px; height:48px; border-radius:999px; background:#D4A373; color:#0a0a0a; font-size:15px; font-weight:bold; line-height:48px; text-align:center;">
      ${escapeHtml(getInitials(name))}
    </div>
  `;
}

function getStudentCommunicationIdentity(
  student: StudentForEngagement,
  managementAuthorId: string
): StudentCommunicationIdentity {
  const assignedUserRole = String(student.user?.role || "").toUpperCase();
  const hasAssignedProfessor = Boolean(
    student.user?.id && ["TEACHER", "PROFESSOR"].includes(assignedUserRole)
  );

  if (hasAssignedProfessor && student.user) {
    return {
      authorId: student.user.id,
      senderName: student.user.name?.trim() || "Seu professor",
      senderRoleLabel: "Professor",
      senderImage: student.user.image || null,
      sentByProfessor: true,
    };
  }

  return {
    authorId: managementAuthorId,
    senderName: "Equipe Funcional VIP Digital",
    senderRoleLabel: "Gestão",
    senderImage: null,
    sentByProfessor: false,
  };
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

async function hasOpenCareEventInCurrentWeek(studentId: string): Promise<boolean> {
  const week = getWeekRange(new Date());

  const existing = await prisma.studentCareEvent.findFirst({
    where: {
      studentId,
      status: {
        not: "RESOLVIDO",
      },
      createdAt: {
        gte: week.startOfWeek,
        lt: week.endOfWeek,
      },
      eventType: {
        in: [
          "EXERCICIO_DIFICIL",
          "DOR_DESCONFORTO",
          "NAO_ENTENDI",
          "FALTA_TEMPO",
          "DESMOTIVACAO",
          "OUTRO",
        ],
      },
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

async function createNotice({
  title,
  content,
  type = "ENGAJAMENTO_TREINO",
  targetRole,
  authorId,
  studentId,
  professorId,
  expiresAt,
}: {
  title: string;
  content: string;
  type?: string;
  targetRole: string;
  authorId: string;
  studentId?: string | null;
  professorId?: string | null;
  expiresAt?: Date | null;
}) {
  return prisma.notice.create({
    data: {
      title,
      content,
      type,
      targetRole,
      authorId,
      studentId: studentId || null,
      professorId: professorId || null,
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
  senderName,
  senderRoleLabel,
  senderImage,
  sentByProfessor,
  subject,
  title,
  content,
}: {
  to: string | null;
  studentName: string;
  senderName: string;
  senderRoleLabel: "Professor" | "Gestão";
  senderImage?: string | null;
  sentByProfessor: boolean;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const safeStudentName = escapeHtml(studentName);
  const safeSenderName = escapeHtml(senderName);
  const safeSenderRoleLabel = escapeHtml(senderRoleLabel);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");
  const avatarHtml = buildEmailAvatarHtml(senderName, senderImage);

  const chatGuidance = sentByProfessor
    ? `Se precisar falar sobre treino, use o chat da plataforma. Assim, ${senderName} consegue acompanhar seu histórico e responder com mais contexto.`
    : "Se precisar falar sobre treino, use o chat da plataforma para que o professor responsável acompanhe seu histórico e responda com mais contexto.";

  const automationDisclosure = sentByProfessor
    ? "Mensagem automática de acompanhamento enviada em nome do seu professor."
    : "Mensagem automática enviada pela gestão do Funcional VIP Digital.";

  const text = [
    `Oi, ${studentName}!`,
    "",
    content,
    "",
    chatGuidance,
    "Para dúvidas de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.",
    "",
    `Enviado por: ${senderName} · ${senderRoleLabel}`,
    automationDisclosure,
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
          <tr>
            <td style="vertical-align:middle; padding-right:12px;">${avatarHtml}</td>
            <td style="vertical-align:middle;">
              <div style="color:#f5f5f5; font-size:15px; font-weight:bold;">${safeSenderName}</div>
              <div style="color:#D4A373; font-size:12px; margin-top:3px;">${safeSenderRoleLabel} · Funcional VIP Digital</div>
            </td>
          </tr>
        </table>

        <h2 style="color:#D4A373; margin:0 0 16px;">${safeTitle}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Oi, <strong>${safeStudentName}</strong>!
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${safeContent}
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${escapeHtml(chatGuidance)}
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          Para dúvidas de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.
        </p>

        <a href="${alunoUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Acessar minha área
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:22px;">
          ${escapeHtml(automationDisclosure)}
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: `${senderName} — ${subject}`,
    text,
    html,
  });

  return true;
}

async function sendProfessorEmail({
  to,
  professorName,
  subject,
  title,
  content,
}: {
  to: string | null;
  professorName: string;
  subject: string;
  title: string;
  content: string;
}) {
  if (!to) return false;

  const dashboardUrl = getAppDashboardUrl();
  const safeProfessorName = escapeHtml(professorName);
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Oi, ${professorName}.`,
    "",
    content,
    "",
    "Acesse o dashboard para revisar o histórico do aluno e registrar a ação realizada.",
    `Dashboard: ${dashboardUrl}`,
    "",
    "Gestão Funcional VIP Digital",
    "Mensagem automática de acompanhamento.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:620px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${safeTitle}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Oi, <strong>${safeProfessorName}</strong>.
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          ${safeContent}
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          Acesse o dashboard para revisar o histórico do aluno e registrar a ação realizada.
        </p>

        <a href="${dashboardUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Acessar dashboard
        </a>

        <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">
          Gestão Funcional VIP Digital
        </p>

        <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">
          Mensagem automática de acompanhamento.
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

async function notifyTodayWorkout({
  workout,
  managementAuthorId,
}: {
  workout: WorkoutForEngagement;
  managementAuthorId: string;
}) {
  const eventType = "WORKOUT_DAY_REMINDER";
  const eventKey = workout.id;

  if (await alreadySent({ studentId: workout.studentId, eventType, eventKey })) {
    return { sent: false, reason: "Já enviado" };
  }

  const workoutName = workout.workoutPlan?.name || "seu treino";
  const studentName = workout.student?.name || "Aluno";
  const identity = getStudentCommunicationIdentity(
    workout.student,
    managementAuthorId
  );
  const title = "Seu treino de hoje está te esperando 💪";

  const content = identity.sentByProfessor
    ? [
        `Oi, ${studentName}! Aqui é ${identity.senderName}.`,
        "",
        `O treino de hoje já está disponível: ${workoutName}.`,
        "Quando puder, reserve esse momento para você e faça tudo com atenção às orientações.",
        "Se alguma coisa não estiver clara ou se precisar adaptar, fale comigo pelo chat da plataforma antes de executar.",
        "",
        "Bom treino! Estou acompanhando sua evolução.",
        identity.senderName,
        "Funcional VIP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n")
    : [
        `Oi, ${studentName}! Aqui é a equipe do Funcional VIP Digital.`,
        "",
        `O treino de hoje já está disponível: ${workoutName}.`,
        "Quando puder, reserve esse momento para você e faça tudo com atenção às orientações.",
        "Se alguma coisa não estiver clara ou se precisar adaptar, fale com o professor responsável pelo chat da plataforma antes de executar.",
        "",
        "Bom treino! Seguimos acompanhando sua evolução.",
        "Equipe Funcional VIP Digital",
        "Mensagem automática de acompanhamento.",
      ].join("\n");

  const notice = await createNotice({
    title,
    content,
    targetRole: "ALUNO",
    authorId: identity.authorId,
    studentId: workout.studentId,
    expiresAt: addDays(1),
  });

  await registerSent({
    studentId: workout.studentId,
    workoutId: workout.id,
    noticeId: notice.id,
    eventType,
    eventKey,
    channel: "AVISO",
  });

  return { sent: true };
}

async function notifyMissedWorkoutLevel({
  student,
  missedWorkouts,
  level,
  managementAuthorId,
}: {
  student: StudentForEngagement;
  missedWorkouts: WorkoutForEngagement[];
  level: 1 | 2 | 3;
  managementAuthorId: string;
}) {
  const latestMissedWorkout = missedWorkouts
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  if (!latestMissedWorkout) {
    return { sent: false, reason: "Sem treino perdido" };
  }

  const eventType = `MISSED_WORKOUT_${level}`;
  const eventKey = latestMissedWorkout.id;

  if (await alreadySent({ studentId: student.id, eventType, eventKey })) {
    return { sent: false, reason: "Já enviado" };
  }

  /*
   * Governança anti-spam:
   * se o aluno já sinalizou nesta semana que teve dor, dificuldade, falta de tempo,
   * desmotivação ou dúvida, não mandamos cobrança genérica de treino perdido.
   * O caso passa a ser tratado pela Central de Cuidado do Aluno.
   */
  if (await hasOpenCareEventInCurrentWeek(student.id)) {
    return {
      sent: false,
      reason: "Aluno já possui evento de cuidado aberto nesta semana. Régua genérica pausada.",
    };
  }

  const studentName = student.name || "Aluno";
  const missedCount = missedWorkouts.length;

  const identity = getStudentCommunicationIdentity(student, managementAuthorId);

  const title =
    level === 1
      ? "Vamos retomar com calma?"
      : level === 2
        ? "Quero entender como apoiar sua rotina"
        : "Vamos reorganizar seus treinos juntos";

  const content =
    level === 1
      ? [
          `Oi, ${studentName}! Aqui é ${identity.senderName}.`,
          "",
          "Vi que o último treino não foi concluído. Isso pode acontecer e não apaga o caminho que você já começou.",
          "Quando estiver pronto, retome pelo próximo treino disponível. Se algo dificultou a execução, me conte pelo chat para eu considerar no seu acompanhamento.",
          "",
          "Vamos seguir um passo de cada vez.",
        ].join("\n")
      : level === 2
        ? [
            `Oi, ${studentName}! Aqui é ${identity.senderName}.`,
            "",
            `Notei que alguns treinos ficaram sem conclusão (${missedCount} até agora). Antes de pensar apenas em constância, quero entender o que está acontecendo na sua rotina.`,
            "Pode ser tempo, dúvida, dificuldade com algum exercício ou necessidade de ajuste. Fale comigo pelo chat da plataforma para organizarmos uma proposta mais possível para você.",
            "",
            "Você não precisa resolver isso sozinho.",
          ].join("\n")
        : [
            `Oi, ${studentName}! Aqui é ${identity.senderName}.`,
            "",
            `Percebi que ${missedCount} treinos ficaram sem conclusão. Quero evitar que essa sequência vire um afastamento do seu objetivo.`,
            "Vamos conversar pelo chat da plataforma para entender suas barreiras e decidir juntos se precisamos reduzir duração, ajustar exercícios, reorganizar dias ou fazer uma retomada mais leve.",
            "",
            "Estou aqui para acompanhar de verdade, sem julgamento e respeitando seu momento.",
          ].join("\n");

  const studentNotice = await createNotice({
    title,
    content,
    targetRole: "ALUNO",
    authorId: identity.authorId,
    studentId: student.id,
    expiresAt: addDays(level === 1 ? 7 : 15),
  });

  let studentEmailSent = false;

  try {
    studentEmailSent = await sendStudentEmail({
      to: getStudentEmail(student),
      studentName,
      senderName: identity.senderName,
      senderRoleLabel: identity.senderRoleLabel,
      senderImage: identity.senderImage,
      sentByProfessor: identity.sentByProfessor,
      subject: title,
      title,
      content,
    });
  } catch (error) {
    console.error("Erro ao enviar e-mail para aluno com treino perdido:", error);
  }

  let professorNoticeCreated = false;
  let professorEmailSent = false;
  let gestaoNoticeCreated = false;

  if (level >= 2 && student.user?.id) {
    const professorTitle =
      level === 2
        ? `Acompanhar adesão de ${studentName}`
        : `Ação de cuidado necessária com ${studentName}`;

    const professorContent =
      level === 2
        ? [
            `Oi, ${student.user?.name || "professor(a)"}.`,
            "",
            `${studentName} está com ${missedCount} treino(s) sem conclusão.`,
            "Antes de ajustar a programação, faça uma abordagem pelo chat para entender se existe dificuldade de execução, dúvida, falta de tempo ou incompatibilidade com a rotina.",
            "Depois, registre o encaminhamento e adapte o treino se necessário.",
          ].join("\n")
        : [
            `Oi, ${student.user?.name || "professor(a)"}.`,
            "",
            `${studentName} acumula ${missedCount} treino(s) sem conclusão e precisa de uma abordagem ativa de cuidado.`,
            "Converse pelo chat com escuta e sem cobrança. Entenda as barreiras, combine um próximo passo possível e avalie uma retomada mais simples ou ajuste da programação.",
            "A gestão também receberá visibilidade para apoiar o acompanhamento, se necessário.",
          ].join("\n");

    await createNotice({
      title: professorTitle,
      content: professorContent,
      targetRole: "PROFESSOR",
      authorId: managementAuthorId,
      professorId: student.user.id,
      expiresAt: addDays(15),
    });

    professorNoticeCreated = true;

    if (level >= 3) {
      try {
        professorEmailSent = await sendProfessorEmail({
          to: student.user.email,
          professorName: student.user.name || "Professor",
          subject: professorTitle,
          title: professorTitle,
          content: professorContent,
        });
      } catch (error) {
        console.error("Erro ao enviar e-mail para professor:", error);
      }
    }
  }

  if (level >= 3) {
    const gestaoTitle = `Acompanhamento de retenção: ${studentName}`;
    const gestaoContent = [
      `${studentName} está com ${missedCount} treino(s) sem conclusão.`,
      "",
      student.user?.name
        ? `Professor responsável: ${student.user.name}.`
        : "Professor responsável não identificado.",
      "",
      "Ação sugerida para a gestão: acompanhar se o professor realizou uma abordagem pelo chat e se houve combinação de um próximo passo com o aluno.",
      "Se não houver retorno ou se surgirem questões comerciais, a gestão pode fazer contato adicional pelos canais sob sua responsabilidade.",
    ].join("\n");

    await createNotice({
      title: gestaoTitle,
      content: gestaoContent,
      targetRole: "GESTOR",
      authorId: managementAuthorId,
      expiresAt: addDays(15),
    });

    gestaoNoticeCreated = true;
  }

  await registerSent({
    studentId: student.id,
    workoutId: latestMissedWorkout.id,
    noticeId: studentNotice.id,
    eventType,
    eventKey,
    channel: studentEmailSent ? "AVISO_EMAIL" : "AVISO",
  });

  return {
    sent: true,
    level,
    studentEmailSent,
    professorNoticeCreated,
    professorEmailSent,
    gestaoNoticeCreated,
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managementAuthorId = await getNoticeAuthorId();

  if (!managementAuthorId) {
    return NextResponse.json(
      { error: "Nenhum gestor/admin encontrado para assinar os avisos." },
      { status: 400 }
    );
  }

  const { start: todayStart, end: todayEnd } = getTodayRange();
  const lookbackStart = new Date(todayStart);
  lookbackStart.setDate(todayStart.getDate() - 45);

  const todayWorkouts = (await prisma.workout.findMany({
    where: {
      date: {
        gte: todayStart,
        lt: todayEnd,
      },
      status: {
        not: "CONCLUIDO",
      },
      student: {
        active: true,
      },
    },
    include: {
      workoutPlan: {
        select: {
          id: true,
          name: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userId: true,
          userAuth: {
            select: {
              email: true,
              role: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  })) as WorkoutForEngagement[];

  const missedWorkouts = (await prisma.workout.findMany({
    where: {
      date: {
        gte: lookbackStart,
        lt: todayStart,
      },
      status: {
        not: "CONCLUIDO",
      },
      student: {
        active: true,
      },
    },
    include: {
      workoutPlan: {
        select: {
          id: true,
          name: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          userId: true,
          userAuth: {
            select: {
              email: true,
              role: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  })) as WorkoutForEngagement[];

  const reminderResults: any[] = [];
  const missedResults: any[] = [];
  const errors: any[] = [];

  for (const workout of todayWorkouts) {
    try {
      const result = await notifyTodayWorkout({
        workout,
        managementAuthorId,
      });

      reminderResults.push({
        workoutId: workout.id,
        studentId: workout.studentId,
        studentName: workout.student.name,
        ...result,
      });
    } catch (error: any) {
      errors.push({
        type: "TODAY_REMINDER",
        workoutId: workout.id,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  const missedByStudent = new Map<string, WorkoutForEngagement[]>();

  for (const workout of missedWorkouts) {
    if (!missedByStudent.has(workout.studentId)) {
      missedByStudent.set(workout.studentId, []);
    }

    missedByStudent.get(workout.studentId)!.push(workout);
  }

  for (const [studentId, workouts] of Array.from(missedByStudent.entries())) {
    try {
      const student = workouts[0].student;
      const missedCount = workouts.length;
      const level: 1 | 2 | 3 = missedCount >= 3 ? 3 : missedCount === 2 ? 2 : 1;

      const result = await notifyMissedWorkoutLevel({
        student,
        missedWorkouts: workouts,
        level,
        managementAuthorId,
      });

      missedResults.push({
        studentId,
        studentName: student.name,
        missedCount,
        level,
        ...result,
      });
    } catch (error: any) {
      errors.push({
        type: "MISSED_WORKOUT",
        studentId,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    today: {
      start: todayStart.toISOString(),
      end: todayEnd.toISOString(),
      display: formatDatePtBr(todayStart),
    },
    totals: {
      todayWorkouts: todayWorkouts.length,
      remindersSent: reminderResults.filter((item) => item.sent).length,
      studentsWithMissedWorkouts: missedByStudent.size,
      missedNotificationsSent: missedResults.filter((item) => item.sent).length,
      errors: errors.length,
    },
    reminders: reminderResults,
    missed: missedResults,
    errors,
  });
}
