import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SurveyType = "TRIAL_END" | "PAID_START" | "PAID_30_DAYS";

type SurveyEmailRow = {
  id: string;
  student_id: string;
  contract_id: string | null;
  survey_type: SurveyType;
  trigger_date: Date | string | null;
  due_date: Date | string | null;
  email_attempts: number | null;
  student_name: string | null;
  student_email: string | null;
  user_auth_email: string | null;
  professor_name: string | null;
  contract_type: string | null;
  contract_status: string | null;
};

function getCronSecret() {
  return String(process.env.CRON_SECRET || "").trim();
}

function getBearerToken(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token) {
    return token.trim();
  }

  return "";
}

function isAuthorizedCronRequest(req: NextRequest) {
  const secret = getCronSecret();

  /*
   * Em produção, configure CRON_SECRET na Vercel.
   * O Vercel Cron chama a rota com Authorization: Bearer <CRON_SECRET>.
   * Também aceitamos x-cron-secret para teste manual.
   */
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const bearerToken = getBearerToken(req);
  const headerSecret = req.headers.get("x-cron-secret") || "";

  return bearerToken === secret || headerSecret === secret;
}

function getBaseUrl() {
  const explicitUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return (explicitUrl || "http://localhost:3000").replace(/\/$/, "");
}

function getAlunoUrl() {
  return `${getBaseUrl()}/aluno`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSurveyLabel(type?: string | null) {
  const normalized = String(type || "").toUpperCase();

  if (normalized === "TRIAL_END") return "Pesquisa de Experiência Inicial";
  if (normalized === "PAID_START") return "Formulário de Acompanhamento do Aluno";
  if (normalized === "PAID_30_DAYS") return "Pesquisa de Evolução do Primeiro Mês";

  return "Pesquisa do aluno";
}

function getSurveyEmailContent(type: SurveyType, reminder = false) {
  const alunoUrl = getAlunoUrl();

  if (type === "TRIAL_END") {
    return {
      subject: reminder
        ? "Quando puder, conte para a gente como foi seu começo"
        : "Queremos ouvir como foi sua experiência inicial",
      title: reminder
        ? "Sua opinião continua sendo importante"
        : "Como foi seu começo com a gente?",
      intro: reminder
        ? "Passando com carinho para lembrar que sua pesquisa ainda está disponível. Sua resposta ajuda a equipe a entender o que funcionou bem e o que pode ser melhorado para você e para os próximos alunos."
        : "Seu período de experiência chegou ao fim e queremos ouvir você. Conte como se sentiu com os treinos, a plataforma e o acompanhamento recebido.",
      action: "Compartilhar minha experiência",
      url: alunoUrl,
    };
  }

  if (type === "PAID_START") {
    return {
      subject: reminder
        ? "Seu formulário de acompanhamento ainda está disponível"
        : "Vamos deixar seu acompanhamento ainda mais com a sua cara",
      title: reminder
        ? "Quando puder, complete seu formulário"
        : "Queremos conhecer melhor sua rotina",
      intro: reminder
        ? "Seu formulário ainda está pendente. Quando você responder, seu professor terá mais informações para adaptar os próximos treinos à sua rotina, aos seus objetivos e aos seus pontos de atenção."
        : "Agora que seu acompanhamento começou, queremos conhecer melhor sua rotina, seus objetivos, suas preferências e os cuidados que devemos considerar. Essas informações ajudam seu professor a personalizar os próximos treinos.",
      action: "Preencher meu formulário",
      url: alunoUrl,
    };
  }

  return {
    subject: reminder
      ? "Quando puder, conte como foi seu primeiro mês"
      : "Vamos conversar sobre seu primeiro mês de acompanhamento?",
    title: reminder
      ? "Sua pesquisa do primeiro mês continua disponível"
      : "Como você está se sentindo depois do primeiro mês?",
    intro: reminder
      ? "Sua resposta ajuda seu professor a entender o que está funcionando, o que precisa de ajuste e como tornar o próximo ciclo mais adequado para você."
      : "Você completou o primeiro mês de acompanhamento. Conte como está se sentindo, o que percebeu de evolução e o que podemos ajustar para o próximo ciclo.",
    action: "Compartilhar minha percepção",
    url: alunoUrl,
  };
}

function getStudentEmail(row: SurveyEmailRow) {
  return row.student_email || row.user_auth_email || null;
}

async function createPendingSurveysFromContracts() {
  const createdTrialEnd = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO student_surveys (
        student_id,
        contract_id,
        survey_type,
        status,
        trigger_date,
        due_date,
        sent_at
      )
      SELECT
        sc.student_id,
        sc.id,
        'TRIAL_END',
        'PENDING',
        sc.end_date,
        sc.end_date + interval '7 days',
        NULL
      FROM student_contracts sc
      WHERE sc.type = 'TRIAL'
        AND sc.end_date IS NOT NULL
        AND (
          sc.status IN ('FINALIZED', 'CANCELLED')
          OR sc.end_date < now()
        )
        AND NOT EXISTS (
          SELECT 1
          FROM student_surveys ss
          WHERE ss.student_id = sc.student_id
            AND COALESCE(ss.contract_id, '') = COALESCE(sc.id, '')
            AND ss.survey_type = 'TRIAL_END'
        )
      RETURNING id
    `
  )) as Array<{ id: string }>;

  const createdPaidStart = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO student_surveys (
        student_id,
        contract_id,
        survey_type,
        status,
        trigger_date,
        due_date,
        sent_at
      )
      SELECT
        sc.student_id,
        sc.id,
        'PAID_START',
        'PENDING',
        sc.start_date,
        sc.start_date + interval '10 days',
        NULL
      FROM student_contracts sc
      WHERE sc.type = 'PAID'
        AND sc.start_date IS NOT NULL
        AND (
          sc.status = 'ACTIVE'
          OR sc.commercial_status = 'CONTRATO_ATIVO'
        )
        AND sc.start_date <= now()
        AND NOT EXISTS (
          SELECT 1
          FROM student_surveys ss
          WHERE ss.student_id = sc.student_id
            AND COALESCE(ss.contract_id, '') = COALESCE(sc.id, '')
            AND ss.survey_type = 'PAID_START'
        )
      RETURNING id
    `
  )) as Array<{ id: string }>;

  const createdPaid30Days = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO student_surveys (
        student_id,
        contract_id,
        survey_type,
        status,
        trigger_date,
        due_date,
        sent_at
      )
      SELECT
        sc.student_id,
        sc.id,
        'PAID_30_DAYS',
        'PENDING',
        sc.start_date + interval '30 days',
        sc.start_date + interval '40 days',
        NULL
      FROM student_contracts sc
      WHERE sc.type = 'PAID'
        AND sc.start_date IS NOT NULL
        AND (
          sc.status = 'ACTIVE'
          OR sc.commercial_status = 'CONTRATO_ATIVO'
        )
        AND sc.start_date + interval '30 days' <= now()
        AND NOT EXISTS (
          SELECT 1
          FROM student_surveys ss
          WHERE ss.student_id = sc.student_id
            AND COALESCE(ss.contract_id, '') = COALESCE(sc.id, '')
            AND ss.survey_type = 'PAID_30_DAYS'
        )
      RETURNING id
    `
  )) as Array<{ id: string }>;

  return {
    trialEnd: createdTrialEnd.length,
    paidStart: createdPaidStart.length,
    paid30Days: createdPaid30Days.length,
    total: createdTrialEnd.length + createdPaidStart.length + createdPaid30Days.length,
  };
}

async function getInitialEmailQueue(limit = 60) {
  return (await prisma.$queryRawUnsafe(
    `
      SELECT
        ss.id,
        ss.student_id,
        ss.contract_id,
        ss.survey_type,
        ss.trigger_date,
        ss.due_date,
        ss.email_attempts,
        s.name AS student_name,
        s.email AS student_email,
        ua.email AS user_auth_email,
        p.name AS professor_name,
        sc.type AS contract_type,
        sc.status AS contract_status
      FROM student_surveys ss
      JOIN students s ON s.id = ss.student_id
      LEFT JOIN users ua ON ua.id = s.user_auth_id
      LEFT JOIN users p ON p.id = s.user_id
      LEFT JOIN student_contracts sc ON sc.id = ss.contract_id
      WHERE ss.status = 'PENDING'
        AND ss.email_sent_at IS NULL
        AND ss.trigger_date <= now()
        AND COALESCE(ss.email_attempts, 0) < 3
      ORDER BY ss.trigger_date ASC, ss.created_at ASC
      LIMIT $1
    `,
    limit
  )) as SurveyEmailRow[];
}

async function getReminderEmailQueue(limit = 60) {
  return (await prisma.$queryRawUnsafe(
    `
      SELECT
        ss.id,
        ss.student_id,
        ss.contract_id,
        ss.survey_type,
        ss.trigger_date,
        ss.due_date,
        ss.email_attempts,
        s.name AS student_name,
        s.email AS student_email,
        ua.email AS user_auth_email,
        p.name AS professor_name,
        sc.type AS contract_type,
        sc.status AS contract_status
      FROM student_surveys ss
      JOIN students s ON s.id = ss.student_id
      LEFT JOIN users ua ON ua.id = s.user_auth_id
      LEFT JOIN users p ON p.id = s.user_id
      LEFT JOIN student_contracts sc ON sc.id = ss.contract_id
      WHERE ss.status = 'PENDING'
        AND ss.email_sent_at IS NOT NULL
        AND ss.reminder_email_sent_at IS NULL
        AND ss.due_date IS NOT NULL
        AND ss.due_date <= now()
        AND COALESCE(ss.email_attempts, 0) < 5
      ORDER BY ss.due_date ASC, ss.created_at ASC
      LIMIT $1
    `,
    limit
  )) as SurveyEmailRow[];
}

async function markEmailFailure(surveyId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");

  await prisma.$executeRawUnsafe(
    `
      UPDATE student_surveys
      SET
        email_attempts = COALESCE(email_attempts, 0) + 1,
        last_email_error = $2,
        updated_at = now()
      WHERE id = $1
    `,
    surveyId,
    message.slice(0, 1000)
  );
}

async function markMissingEmail(surveyId: string) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE student_surveys
      SET
        email_attempts = 3,
        last_email_error = 'Aluno sem e-mail cadastrado para envio automático.',
        updated_at = now()
      WHERE id = $1
    `,
    surveyId
  );
}

async function markInitialEmailSent(surveyId: string) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE student_surveys
      SET
        email_sent_at = now(),
        sent_at = COALESCE(sent_at, now()),
        email_attempts = COALESCE(email_attempts, 0) + 1,
        last_email_error = NULL,
        updated_at = now()
      WHERE id = $1
    `,
    surveyId
  );
}

async function markReminderEmailSent(surveyId: string) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE student_surveys
      SET
        reminder_email_sent_at = now(),
        email_attempts = COALESCE(email_attempts, 0) + 1,
        last_email_error = NULL,
        updated_at = now()
      WHERE id = $1
    `,
    surveyId
  );
}

async function sendSurveyEmail(row: SurveyEmailRow, reminder = false) {
  const to = getStudentEmail(row);

  if (!to) {
    await markMissingEmail(row.id);
    return { sent: false, skipped: true, reason: "missing_email" };
  }

  const type = row.survey_type;
  const studentName = row.student_name || "Aluno";
  const professorName = row.professor_name || "seu professor";
  const surveyLabel = getSurveyLabel(type);
  const content = getSurveyEmailContent(type, reminder);
  const safeStudentName = escapeHtml(studentName);
  const safeProfessorName = escapeHtml(professorName);
  const safeTitle = escapeHtml(content.title);
  const safeIntro = escapeHtml(content.intro);
  const safeSurveyLabel = escapeHtml(surveyLabel);
  const safeAction = escapeHtml(content.action);
  const alunoUrl = content.url;

  const text = [
    `Oi, ${studentName}! Tudo bem?`,
    "",
    content.intro,
    "",
    `Pesquisa: ${surveyLabel}`,
    `Sua resposta ajudará ${professorName} e a equipe a cuidar melhor do seu acompanhamento.`,
    "",
    "Para dúvidas sobre seus treinos, use o chat da plataforma. Assim, a conversa fica registrada e pode ser acompanhada com segurança.",
    "O WhatsApp fica reservado para contatos específicos da gestão.",
    "",
    `Responder pela área do aluno: ${alunoUrl}`,
    "",
    "Equipe Funcional VIP Digital",
    "Mensagem automática de acompanhamento.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <p style="color:#D4A373; margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:2px; font-weight:bold;">
          ${safeSurveyLabel}
        </p>
        <h2 style="color:#f5f5f5; margin:0 0 16px; font-size:22px;">${safeTitle}</h2>
        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>! Tudo bem?</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">${safeIntro}</p>

        <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:18px 0;">
          <p style="color:#d4d4d4; font-size:13px; line-height:1.6; margin:0;">
            Sua resposta ajudará <strong style="color:#f5f5f5;">${safeProfessorName}</strong> e a equipe a entender o que está funcionando e o que pode ser ajustado no seu acompanhamento.
          </p>
        </div>

        <p style="color:#d4d4d4; font-size:13px; line-height:1.6;">
          Para dúvidas sobre seus treinos, use o chat da plataforma. Assim, a conversa fica registrada e pode ser acompanhada com segurança. O WhatsApp fica reservado para contatos específicos da gestão.
        </p>

        <a href="${alunoUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          ${safeAction}
        </a>

        <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">
          Equipe Funcional VIP Digital
        </p>
        <p style="color:#6b6b6b; font-size:11px; margin-top:8px; line-height:1.5;">
          Mensagem automática de acompanhamento. A pesquisa está disponível na sua área do aluno.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: content.subject,
    text,
    html,
  });

  if (reminder) {
    await markReminderEmailSent(row.id);
  } else {
    await markInitialEmailSent(row.id);
  }

  return { sent: true, skipped: false, reason: null };
}


async function processEmailQueue(rows: SurveyEmailRow[], reminder = false) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await sendSurveyEmail(row, reminder);

      if (result.sent) sent += 1;
      else if (result.skipped) skipped += 1;
    } catch (error) {
      failed += 1;
      await markEmailFailure(row.id, error);
    }
  }

  return { sent, skipped, failed };
}

async function runSurveyCron() {
  const created = await createPendingSurveysFromContracts();
  const initialQueue = await getInitialEmailQueue(80);
  const reminderQueue = await getReminderEmailQueue(80);

  const initial = await processEmailQueue(initialQueue, false);
  const reminders = await processEmailQueue(reminderQueue, true);

  return {
    ok: true,
    created,
    initialQueue: initialQueue.length,
    reminderQueue: reminderQueue.length,
    initial,
    reminders,
    ranAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Acesso negado ao cron." }, { status: 401 });
  }

  try {
    const result = await runSurveyCron();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("GET /api/cron/student-surveys error:", error);
    return NextResponse.json(
      {
        error: "Erro ao executar cron de pesquisas.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
