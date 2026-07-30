import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManageEvolution(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN" || role === "TEACHER";
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);

  return date;
}

function getAppAlunoUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/aluno`;
}

function getAppEvolutionUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/dashboard/evolucao-alunos`;
}

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id) return null;

  return {
    id: String(sessionUser.id),
    name: String(sessionUser.name || "Usuário"),
    email: sessionUser.email ? String(sessionUser.email) : null,
    role: normalizeRole(sessionUser.role),
  };
}

async function getFeedbackById(id: string) {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      ef.*,
      s.name AS student_name,
      s.email AS student_email,
      s.user_id AS student_professor_id,
      ua.email AS user_auth_email,
      p.name AS professor_name,
      p.email AS professor_email
    FROM evolution_feedbacks ef
    JOIN students s ON s.id = ef.student_id
    LEFT JOIN users ua ON ua.id = s.user_auth_id
    LEFT JOIN users p ON p.id = COALESCE(ef.professor_id, s.user_id)
    WHERE ef.id = ${id}
    LIMIT 1
  `;

  return rows[0] || null;
}

function assertCanAccessFeedback(user: { id: string; role: string }, feedback: any): boolean {
  if (user.role === "GESTOR" || user.role === "ADMIN") return true;
  if (user.role === "TEACHER") {
    return feedback?.professor_id === user.id || feedback?.student_professor_id === user.id;
  }

  return false;
}

async function getStudentEmailFromFeedback(feedback: any): Promise<string | null> {
  return feedback?.student_email || feedback?.user_auth_email || null;
}

async function sendStudentEvolutionEmail({
  to,
  studentName,
  professorName,
  milestone,
  content,
}: {
  to: string | null;
  studentName: string;
  professorName: string;
  milestone: number;
  content: string;
}) {
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const title = `Uma mensagem sobre sua evolução: ${milestone} treinos`;
  const safeStudentName = escapeHtml(studentName);
  const safeProfessorName = escapeHtml(professorName || "seu professor");
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  await sendEmail({
    to,
    subject: title,
    text: [
      `Oi, ${studentName}!`,
      "",
      content,
      "",
      "Se quiser conversar sobre essa devolutiva ou combinar o próximo foco, use o chat da plataforma.",
      "Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.",
      "",
      professorName || "Seu professor",
      "Funcional UP Digital",
      "Mensagem enviada pelo seu professor por meio da plataforma.",
      "",
      `Acesse sua área do aluno: ${alunoUrl}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#22D3EE; margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">${safeContent}</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se quiser conversar sobre essa devolutiva ou combinar o próximo foco, use o chat da plataforma.</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.</p>
          <a href="${alunoUrl}" style="display:inline-block; background:#22D3EE; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Acessar minha área</a>
          <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional UP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem enviada pelo seu professor por meio da plataforma.</p>
        </div>
      </div>
    `,
  });

  return true;
}

async function buildStatusCounts(user: { id: string; role: string }) {
  const roleFilter = user.role === "TEACHER"
    ? Prisma.sql`AND (ef.professor_id = ${user.id} OR s.user_id = ${user.id})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
    SELECT ef.status, COUNT(*)::bigint AS count
    FROM evolution_feedbacks ef
    JOIN students s ON s.id = ef.student_id
    WHERE 1 = 1
    ${roleFilter}
    GROUP BY ef.status
  `;

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[String(row.status || "SEM_STATUS")] = Number(row.count || 0);
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!canManageEvolution(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = String(searchParams.get("status") || "").trim().toUpperCase();
    const includeSent = searchParams.get("includeSent") === "1";

    const roleFilter = user.role === "TEACHER"
      ? Prisma.sql`AND (ef.professor_id = ${user.id} OR s.user_id = ${user.id})`
      : Prisma.empty;

    const statusFilter = status
      ? Prisma.sql`AND ef.status = ${status}`
      : includeSent
        ? Prisma.empty
        : Prisma.sql`AND ef.status <> 'ENVIADO'`;

    const feedbacks = await prisma.$queryRaw<any[]>`
      SELECT
        ef.id,
        ef.student_id,
        ef.professor_id,
        ef.milestone,
        ef.status,
        ef.completed_workouts_count,
        ef.contract_id,
        ef.draft,
        ef.final_content,
        ef.bio_requested_at,
        ef.ready_at,
        ef.sent_at,
        ef.created_at,
        ef.updated_at,
        s.name AS student_name,
        s.email AS student_email,
        s.phone AS student_phone,
        s.commercial_status,
        s.contracted_training_days_per_month,
        p.name AS professor_name,
        p.email AS professor_email,
        (
          SELECT COUNT(*)::int
          FROM workouts w
          WHERE w.student_id = s.id
            AND w.status = 'CONCLUIDO'
            AND (ef.contract_id IS NULL OR w.contract_id = ef.contract_id)
        ) AS current_completed_count,
        (
          SELECT COUNT(*)::int
          FROM student_care_events sce
          WHERE sce.student_id = s.id
            AND sce.status <> 'RESOLVIDO'
        ) AS open_care_events,
        (
          SELECT COUNT(*)::int
          FROM questions q
          WHERE q.student_id = s.id
            AND q.parent_id IS NULL
            AND q.resolved_at IS NULL
        ) AS open_questions,
        (
          SELECT a.created_at
          FROM avaliacoes a
          WHERE a.aluno_id = s.id
          ORDER BY a.created_at ASC
          LIMIT 1
        ) AS first_assessment_at,
        (
          SELECT a.created_at
          FROM avaliacoes a
          WHERE a.aluno_id = s.id
          ORDER BY a.created_at DESC
          LIMIT 1
        ) AS latest_assessment_at
      FROM evolution_feedbacks ef
      JOIN students s ON s.id = ef.student_id
      LEFT JOIN users p ON p.id = COALESCE(ef.professor_id, s.user_id)
      WHERE 1 = 1
      ${roleFilter}
      ${statusFilter}
      ORDER BY
        CASE ef.status
          WHEN 'PENDENTE_PROFESSOR' THEN 1
          WHEN 'AGUARDANDO_BIOIMPEDANCIA' THEN 2
          WHEN 'RASCUNHO' THEN 3
          WHEN 'ENVIADO' THEN 4
          ELSE 5
        END,
        ef.created_at DESC
      LIMIT 200
    `;

    const counts = await buildStatusCounts(user);

    return NextResponse.json({
      ok: true,
      feedbacks,
      counts,
      evolutionUrl: getAppEvolutionUrl(),
    });
  } catch (error: any) {
    console.error("GET /api/evolution-feedbacks error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar feedbacks de evolução", message: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!canManageEvolution(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();
    const content = String(body?.content || body?.draft || body?.finalContent || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Informe o id do feedback." }, { status: 400 });
    }

    const feedback = await getFeedbackById(id);

    if (!feedback) {
      return NextResponse.json({ error: "Feedback não encontrado." }, { status: 404 });
    }

    if (!assertCanAccessFeedback(user, feedback)) {
      return NextResponse.json({ error: "Você não tem acesso a este feedback." }, { status: 403 });
    }

    if (action === "SAVE_DRAFT") {
      await prisma.$executeRaw`
        UPDATE evolution_feedbacks
        SET draft = ${content}, status = 'RASCUNHO', updated_at = NOW()
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, message: "Rascunho salvo." });
    }

    if (action === "SEND_FEEDBACK") {
      if (!content) {
        return NextResponse.json(
          { error: "Escreva o conteúdo do feedback antes de enviar." },
          { status: 400 }
        );
      }

      const title = `Uma mensagem sobre sua evolução: ${feedback.milestone} treinos`;

      const notice = await prisma.notice.create({
        data: {
          title,
          content,
          type: "EVOLUTION_FEEDBACK",
          authorId: user.id,
          studentId: feedback.student_id,
          targetRole: "ALUNO",
          expiresAt: addDays(90),
        },
        select: {
          id: true,
        },
      });

      let emailSent = false;

      try {
        emailSent = await sendStudentEvolutionEmail({
          to: await getStudentEmailFromFeedback(feedback),
          studentName: feedback.student_name || "Aluno",
          professorName: feedback.professor_name || user.name || "seu professor",
          milestone: Number(feedback.milestone || 0),
          content,
        });
      } catch (error) {
        console.error("Erro ao enviar e-mail de feedback de evolução:", error);
      }

      await prisma.$executeRaw`
        UPDATE evolution_feedbacks
        SET
          status = 'ENVIADO',
          final_content = ${content},
          student_feedback_notice_id = ${notice.id},
          sent_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}
      `;

      try {
        await prisma.workoutEngagementNotification.create({
          data: {
            studentId: feedback.student_id,
            noticeId: notice.id,
            eventType: "EVOLUTION_FEEDBACK_SENT",
            eventKey: `FEEDBACK|${id}`,
            channel: emailSent ? "AVISO_EMAIL" : "AVISO",
          },
        });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
      }

      return NextResponse.json({
        ok: true,
        message: emailSent
          ? "Feedback enviado ao aluno por aviso e e-mail."
          : "Feedback enviado ao aluno por aviso.",
        noticeId: notice.id,
        emailSent,
      });
    }

    if (action === "REOPEN") {
      await prisma.$executeRaw`
        UPDATE evolution_feedbacks
        SET status = 'PENDENTE_PROFESSOR', updated_at = NOW()
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, message: "Feedback reaberto para revisão." });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/evolution-feedbacks error:", error);
    return NextResponse.json(
      { error: "Erro ao processar feedback de evolução", message: error?.message },
      { status: 500 }
    );
  }
}
