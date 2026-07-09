import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

type SurveyType = "TRIAL_END" | "PAID_START" | "PAID_30_DAYS";

type SurveyRow = {
  id: string;
  student_id: string;
  contract_id: string | null;
  survey_type: SurveyType;
  status: string;
  trigger_date: Date | string;
  due_date: Date | string | null;
  sent_at: Date | string | null;
  answered_at: Date | string | null;
  nps: number | null;
  overall_rating: number | null;
  ease_rating: number | null;
  workout_fit_rating: number | null;
  support_rating: number | null;
  evolution_rating: number | null;
  continue_intention: string | null;
  main_difficulty: string | null;
  favorite_point: string | null;
  improvement_suggestion: string | null;
  open_feedback: string | null;
  answers_json: any;
  created_at: Date | string;
  updated_at: Date | string;
  student_name?: string | null;
  student_email?: string | null;
  professor_id?: string | null;
  professor_name?: string | null;
  contract_type?: string | null;
  contract_status?: string | null;
  contract_start_date?: Date | string | null;
  contract_end_date?: Date | string | null;
};

function normalizeRole(value?: string | null) {
  const role = String(value || "").toUpperCase();

  if (role === "ALUNO") return "STUDENT";
  if (role === "PROFESSOR") return "TEACHER";

  return role;
}

function isManager(role: string) {
  return role === "GESTOR" || role === "ADMIN";
}

function isTeacher(role: string) {
  return role === "TEACHER";
}

function isStudent(role: string) {
  return role === "STUDENT";
}

function toIso(value?: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function cleanText(value: unknown, maxLength = 4000) {
  const text = String(value ?? "").replace(/\r/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function parseRating(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 10) return null;
  return rounded;
}

function getSurveyLabel(type?: string | null) {
  const normalized = String(type || "").toUpperCase();

  if (normalized === "TRIAL_END") return "Pesquisa de Experiência Inicial";
  if (normalized === "PAID_START") return "Formulário de Acompanhamento do Aluno";
  if (normalized === "PAID_30_DAYS") return "Pesquisa de Evolução do Primeiro Mês";

  return "Pesquisa do aluno";
}

function mapSurvey(row: SurveyRow) {
  return {
    id: row.id,
    studentId: row.student_id,
    contractId: row.contract_id,
    surveyType: row.survey_type,
    surveyLabel: getSurveyLabel(row.survey_type),
    status: row.status,
    triggerDate: toIso(row.trigger_date),
    dueDate: toIso(row.due_date),
    sentAt: toIso(row.sent_at),
    answeredAt: toIso(row.answered_at),
    nps: row.nps,
    overallRating: row.overall_rating,
    easeRating: row.ease_rating,
    workoutFitRating: row.workout_fit_rating,
    supportRating: row.support_rating,
    evolutionRating: row.evolution_rating,
    continueIntention: row.continue_intention,
    mainDifficulty: row.main_difficulty,
    favoritePoint: row.favorite_point,
    improvementSuggestion: row.improvement_suggestion,
    openFeedback: row.open_feedback,
    answers: row.answers_json || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    student: {
      name: row.student_name || null,
      email: row.student_email || null,
    },
    professor: {
      id: row.professor_id || null,
      name: row.professor_name || null,
    },
    contract: {
      type: row.contract_type || null,
      status: row.contract_status || null,
      startDate: toIso(row.contract_start_date || null),
      endDate: toIso(row.contract_end_date || null),
    },
  };
}

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id) return null;

  return prisma.user.findUnique({
    where: { id: String(sessionUser.id) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

async function getStudentForUser(userId: string) {
  return prisma.student.findFirst({
    where: {
      OR: [
        { userAuthId: userId },
        { userId },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      userAuthId: true,
    },
  });
}

async function insertPendingSurvey(params: {
  studentId: string;
  contractId: string | null;
  surveyType: SurveyType;
  triggerDate: Date;
  dueDate: Date;
}) {
  await prisma.$executeRawUnsafe(
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
      SELECT $1, $2, $3, 'PENDING', $4, $5, now()
      WHERE NOT EXISTS (
        SELECT 1
        FROM student_surveys
        WHERE student_id = $1
          AND COALESCE(contract_id, '') = COALESCE($2, '')
          AND survey_type = $3
      )
    `,
    params.studentId,
    params.contractId,
    params.surveyType,
    params.triggerDate,
    params.dueDate
  );
}

async function ensurePendingSurveysForStudent(studentId: string) {
  const contracts = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        type,
        status,
        commercial_status,
        start_date,
        end_date
      FROM student_contracts
      WHERE student_id = $1
      ORDER BY start_date ASC, created_at ASC
    `,
    studentId
  );

  const today = startOfDay(new Date());

  for (const contract of contracts) {
    const contractId = String(contract.id || "");
    const type = String(contract.type || "").toUpperCase();
    const status = String(contract.status || "").toUpperCase();
    const commercialStatus = String(contract.commercial_status || "").toUpperCase();
    const startDate = contract.start_date ? startOfDay(new Date(contract.start_date)) : null;
    const endDate = contract.end_date ? startOfDay(new Date(contract.end_date)) : null;

    if (!contractId) continue;

    if (type === "TRIAL" && endDate) {
      const ended = status === "FINALIZED" || status === "CANCELLED" || endDate.getTime() < today.getTime();

      if (ended) {
        await insertPendingSurvey({
          studentId,
          contractId,
          surveyType: "TRIAL_END",
          triggerDate: endDate,
          dueDate: addDays(endDate, 7),
        });
      }
    }

    if (type === "PAID" && startDate) {
      const isPaidActive =
        status === "ACTIVE" ||
        commercialStatus === "CONTRATO_ATIVO";

      if (isPaidActive && startDate.getTime() <= today.getTime()) {
        await insertPendingSurvey({
          studentId,
          contractId,
          surveyType: "PAID_START",
          triggerDate: startDate,
          dueDate: addDays(startDate, 10),
        });
      }

      const paid30Date = addDays(startDate, 30);

      if (isPaidActive && paid30Date.getTime() <= today.getTime()) {
        await insertPendingSurvey({
          studentId,
          contractId,
          surveyType: "PAID_30_DAYS",
          triggerDate: paid30Date,
          dueDate: addDays(paid30Date, 10),
        });
      }
    }
  }
}

async function listSurveys(params: {
  role: string;
  userId: string;
  studentId?: string | null;
  status?: string | null;
}) {
  const status = String(params.status || "PENDING").toUpperCase();
  const studentIdFilter = cleanText(params.studentId, 200);
  const whereParts: string[] = ["1=1"];
  const values: any[] = [];

  function addParam(value: any) {
    values.push(value);
    return `$${values.length}`;
  }

  if (status !== "ALL") {
    whereParts.push(`ss.status = ${addParam(status)}`);
  }

  if (studentIdFilter) {
    whereParts.push(`ss.student_id = ${addParam(studentIdFilter)}`);
  }

  if (isTeacher(params.role)) {
    whereParts.push(`s.user_id = ${addParam(params.userId)}`);
  }

  if (isStudent(params.role)) {
    whereParts.push(`s.user_auth_id = ${addParam(params.userId)}`);
  }

  const rows = await prisma.$queryRawUnsafe<SurveyRow[]>(
    `
      SELECT
        ss.*,
        s.name AS student_name,
        s.email AS student_email,
        s.user_id AS professor_id,
        p.name AS professor_name,
        sc.type AS contract_type,
        sc.status AS contract_status,
        sc.start_date AS contract_start_date,
        sc.end_date AS contract_end_date
      FROM student_surveys ss
      JOIN students s ON s.id = ss.student_id
      LEFT JOIN users p ON p.id = s.user_id
      LEFT JOIN student_contracts sc ON sc.id = ss.contract_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY
        CASE ss.status WHEN 'PENDING' THEN 0 WHEN 'ANSWERED' THEN 1 ELSE 2 END,
        ss.created_at DESC
      LIMIT 200
    `,
    ...values
  );

  return rows.map(mapSurvey);
}

async function createLowScoreNotice(params: {
  authorId: string;
  studentId: string;
  professorId: string | null;
  studentName: string;
  surveyType: string;
  nps: number | null;
  overallRating: number | null;
  openFeedback: string | null;
}) {
  const lowNps = params.nps !== null && params.nps <= 6;
  const lowOverall = params.overallRating !== null && params.overallRating <= 6;

  if (!lowNps && !lowOverall) return;

  const title = "Atenção: pesquisa com baixa satisfação";
  const content = [
    `${params.studentName} respondeu ${getSurveyLabel(params.surveyType)} com sinal de atenção.`,
    params.nps !== null ? `NPS: ${params.nps}/10.` : null,
    params.overallRating !== null ? `Nota geral: ${params.overallRating}/10.` : null,
    params.openFeedback ? `Comentário: ${params.openFeedback}` : null,
    "Recomendação: olhar a ficha do aluno, histórico de treinos, dúvidas e cuidado antes do próximo contato.",
  ]
    .filter(Boolean)
    .join("\n");

  await prisma.notice.create({
    data: {
      title,
      content,
      type: "SURVEY_ALERT",
      targetRole: params.professorId ? "TEACHER" : "GESTOR",
      studentId: params.studentId,
      professorId: params.professorId || null,
      authorId: params.authorId,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const role = normalizeRole(currentUser.role);
    const { searchParams } = new URL(req.url);
    const studentIdParam = searchParams.get("studentId");
    const status = searchParams.get("status") || "PENDING";

    if (isStudent(role)) {
      const student = await getStudentForUser(currentUser.id);

      if (!student) {
        return NextResponse.json({ surveys: [], counts: {}, message: "Aluno não encontrado." });
      }

      await ensurePendingSurveysForStudent(student.id);

      const surveys = await listSurveys({
        role,
        userId: currentUser.id,
        studentId: student.id,
        status,
      });

      return NextResponse.json({ surveys, counts: buildCounts(surveys) });
    }

    if (!isTeacher(role) && !isManager(role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    if (studentIdParam) {
      await ensurePendingSurveysForStudent(studentIdParam);
    }

    const surveys = await listSurveys({
      role,
      userId: currentUser.id,
      studentId: studentIdParam,
      status,
    });

    return NextResponse.json({ surveys, counts: buildCounts(surveys) });
  } catch (error: any) {
    console.error("GET /api/student-surveys error:", error);
    return NextResponse.json(
      {
        error: "Erro ao buscar pesquisas do aluno.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

function buildCounts(surveys: ReturnType<typeof mapSurvey>[]) {
  return surveys.reduce(
    (acc, survey) => {
      const status = String(survey.status || "PENDING").toUpperCase();
      const type = String(survey.surveyType || "").toUpperCase();

      acc.total += 1;
      if (status === "PENDING") acc.pending += 1;
      if (status === "ANSWERED") acc.answered += 1;
      if (type === "TRIAL_END") acc.trialEnd += 1;
      if (type === "PAID_START") acc.paidStart += 1;
      if (type === "PAID_30_DAYS") acc.paid30Days += 1;

      return acc;
    },
    {
      total: 0,
      pending: 0,
      answered: 0,
      trialEnd: 0,
      paidStart: 0,
      paid30Days: 0,
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const role = normalizeRole(currentUser.role);
    const body = await req.json().catch(() => ({}));
    const surveyId = cleanText(body?.surveyId || body?.id, 200);

    if (!surveyId) {
      return NextResponse.json({ error: "surveyId é obrigatório." }, { status: 400 });
    }

    const surveyRows = await prisma.$queryRawUnsafe<SurveyRow[]>(
      `
        SELECT
          ss.*,
          s.name AS student_name,
          s.email AS student_email,
          s.user_id AS professor_id,
          p.name AS professor_name,
          sc.type AS contract_type,
          sc.status AS contract_status,
          sc.start_date AS contract_start_date,
          sc.end_date AS contract_end_date
        FROM student_surveys ss
        JOIN students s ON s.id = ss.student_id
        LEFT JOIN users p ON p.id = s.user_id
        LEFT JOIN student_contracts sc ON sc.id = ss.contract_id
        WHERE ss.id = $1
        LIMIT 1
      `,
      surveyId
    );

    const survey = surveyRows[0];

    if (!survey) {
      return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });
    }

    if (isStudent(role)) {
      const student = await getStudentForUser(currentUser.id);

      if (!student || student.id !== survey.student_id) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
    } else if (isTeacher(role)) {
      if (survey.professor_id !== currentUser.id) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
    } else if (!isManager(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};
    const nps = parseRating(body?.nps ?? answers?.nps);
    const overallRating = parseRating(body?.overallRating ?? answers?.overallRating);
    const easeRating = parseRating(body?.easeRating ?? answers?.easeRating);
    const workoutFitRating = parseRating(body?.workoutFitRating ?? answers?.workoutFitRating);
    const supportRating = parseRating(body?.supportRating ?? answers?.supportRating);
    const evolutionRating = parseRating(body?.evolutionRating ?? answers?.evolutionRating);
    const continueIntention = cleanText(body?.continueIntention ?? answers?.continueIntention, 1000);
    const mainDifficulty = cleanText(body?.mainDifficulty ?? answers?.mainDifficulty, 1500);
    const favoritePoint = cleanText(body?.favoritePoint ?? answers?.favoritePoint, 1500);
    const improvementSuggestion = cleanText(body?.improvementSuggestion ?? answers?.improvementSuggestion, 2000);
    const openFeedback = cleanText(body?.openFeedback ?? answers?.openFeedback, 3000);

    const answersJson = JSON.stringify({
      ...answers,
      nps,
      overallRating,
      easeRating,
      workoutFitRating,
      supportRating,
      evolutionRating,
      continueIntention,
      mainDifficulty,
      favoritePoint,
      improvementSuggestion,
      openFeedback,
    });

    await prisma.$executeRawUnsafe(
      `
        UPDATE student_surveys
        SET
          status = 'ANSWERED',
          answered_at = now(),
          nps = $2,
          overall_rating = $3,
          ease_rating = $4,
          workout_fit_rating = $5,
          support_rating = $6,
          evolution_rating = $7,
          continue_intention = $8,
          main_difficulty = $9,
          favorite_point = $10,
          improvement_suggestion = $11,
          open_feedback = $12,
          answers_json = $13::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      surveyId,
      nps,
      overallRating,
      easeRating,
      workoutFitRating,
      supportRating,
      evolutionRating,
      continueIntention,
      mainDifficulty,
      favoritePoint,
      improvementSuggestion,
      openFeedback,
      answersJson
    );

    await createLowScoreNotice({
      authorId: currentUser.id,
      studentId: survey.student_id,
      professorId: survey.professor_id || null,
      studentName: survey.student_name || "Aluno",
      surveyType: survey.survey_type,
      nps,
      overallRating,
      openFeedback,
    });

    return NextResponse.json({
      ok: true,
      message: "Pesquisa enviada. Obrigado por compartilhar sua percepção.",
    });
  } catch (error: any) {
    console.error("POST /api/student-surveys error:", error);
    return NextResponse.json(
      {
        error: "Erro ao enviar pesquisa.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
