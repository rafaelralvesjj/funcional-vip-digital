import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

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

async function getSessionContext() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  return {
    userId: user?.id ? String(user.id) : null,
    email: user?.email ? String(user.email) : null,
    role: normalizeRole(user?.role),
  };
}

async function getStudentMap(studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, any>();

  const students = await prisma.student.findMany({
    where: {
      id: {
        in: studentIds,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
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

  return new Map(students.map((student) => [student.id, student]));
}

async function getAvaliacaoMap(avaliacaoIds: string[]) {
  if (avaliacaoIds.length === 0) return new Map<string, any>();

  const avaliacoes = await prisma.avaliacao.findMany({
    where: {
      id: {
        in: avaliacaoIds,
      },
    },
    select: {
      id: true,
      peso: true,
      altura: true,
      abdomen: true,
      quadril: true,
      braco: true,
      coxa: true,
      gluteo: true,
      objetivo: true,
      createdAt: true,
    },
  });

  return new Map(avaliacoes.map((avaliacao) => [avaliacao.id, avaliacao]));
}

function getStudentEmail(student: any): string | null {
  return student?.email || student?.userAuth?.email || null;
}

async function sendFeedbackEmail({
  student,
  content,
  milestone,
}: {
  student: any;
  content: string;
  milestone: number;
}) {
  const to = getStudentEmail(student);
  if (!to) return false;

  const alunoUrl = getAppAlunoUrl();
  const professorName = student?.user?.name || "seu professor";
  const title = `Uma mensagem sobre sua evolução - ${milestone} treinos`;
  const safeStudentName = escapeHtml(student?.name || "Aluno");
  const safeProfessorName = escapeHtml(professorName);
  const safeContent = escapeHtml(content).replaceAll("\n", "<br />");

  const text = [
    `Oi, ${student?.name || "Aluno"}!`,
    "",
    content,
    "",
    "Se quiser conversar sobre essa devolutiva ou combinar o próximo foco, use o chat da plataforma.",
    "Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.",
    "",
    professorName,
    "Funcional UP Digital",
    "Mensagem enviada pelo seu professor por meio da plataforma.",
    "",
    `Acesse sua área do aluno: ${alunoUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:680px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#00A19C; margin:0 0 16px;">${escapeHtml(title)}</h2>
        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">${safeContent}</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se quiser conversar sobre essa devolutiva ou combinar o próximo foco, use o chat da plataforma.</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para assuntos de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.</p>
        <a href="${alunoUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Acessar minha área</a>
        <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional UP Digital</p>
        <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem enviada pelo seu professor por meio da plataforma.</p>
      </div>
    </div>
  `;

  await sendEmail({ to, subject: title, text, html });
  return true;
}

export async function GET() {
  try {
    const { userId, role } = await getSessionContext();

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const where: any = {};

    if (role === "TEACHER") {
      where.professorId = userId;
    } else if (role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: {
          userAuthId: userId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return NextResponse.json([]);
      }

      where.studentId = student.id;
      where.status = "ENVIADO";
    } else if (role !== "GESTOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const feedbacks = await prisma.evolutionFeedback.findMany({
      where,
      orderBy: [
        {
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    const studentIds = Array.from(new Set(feedbacks.map((feedback) => feedback.studentId)));
    const avaliacaoIds = Array.from(
      new Set(
        feedbacks
          .flatMap((feedback) => [feedback.baselineAvaliacaoId, feedback.currentAvaliacaoId])
          .filter((id): id is string => Boolean(id))
      )
    );

    const studentMap = await getStudentMap(studentIds);
    const avaliacaoMap = await getAvaliacaoMap(avaliacaoIds);

    const response = feedbacks.map((feedback) => {
      const student = studentMap.get(feedback.studentId);

      return {
        ...feedback,
        studentName: student?.name || "Aluno",
        studentEmail: getStudentEmail(student),
        professorName: student?.user?.name || "Professor",
        professorEmail: student?.user?.email || null,
        baselineAvaliacao: feedback.baselineAvaliacaoId
          ? avaliacaoMap.get(feedback.baselineAvaliacaoId) || null
          : null,
        currentAvaliacao: feedback.currentAvaliacaoId
          ? avaliacaoMap.get(feedback.currentAvaliacaoId) || null
          : null,
      };
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET /api/evolution-feedback error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, role } = await getSessionContext();

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : null;
    const action = typeof body?.action === "string" ? body.action : "save";
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const feedback = await prisma.evolutionFeedback.findUnique({
      where: {
        id,
      },
    });

    if (!feedback) {
      return NextResponse.json({ error: "Feedback não encontrado" }, { status: 404 });
    }

    const canManage =
      role === "GESTOR" ||
      role === "ADMIN" ||
      (role === "TEACHER" && feedback.professorId === userId);

    if (!canManage) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    if (action === "save") {
      const updated = await prisma.evolutionFeedback.update({
        where: {
          id,
        },
        data: {
          draft: content || feedback.draft,
        },
      });

      return NextResponse.json({
        ok: true,
        action: "saved",
        feedback: updated,
      });
    }

    if (action !== "send") {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json(
        { error: "Preencha o conteúdo do feedback antes de enviar" },
        { status: 400 }
      );
    }

    if (feedback.status === "ENVIADO") {
      return NextResponse.json({
        ok: true,
        action: "already_sent",
        feedback,
      });
    }

    const student = await prisma.student.findUnique({
      where: {
        id: feedback.studentId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        userAuth: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const title = `Uma mensagem sobre sua evolução - ${feedback.milestone} treinos`;

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        type: "FEEDBACK_EVOLUCAO",
        targetRole: "ALUNO",
        studentId: feedback.studentId,
        authorId: userId,
      },
      select: {
        id: true,
      },
    });

    let emailSent = false;

    try {
      emailSent = await sendFeedbackEmail({
        student,
        content,
        milestone: feedback.milestone,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de feedback de evolução:", error);
    }

    const updated = await prisma.evolutionFeedback.update({
      where: {
        id,
      },
      data: {
        status: "ENVIADO",
        finalContent: content,
        draft: content,
        studentFeedbackNoticeId: notice.id,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      action: "sent",
      emailSent,
      feedback: updated,
    });
  } catch (error: any) {
    console.error("PUT /api/evolution-feedback error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}
