import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export const maxDuration = 60;

type StudentForFeedback = {
  id: string;
  name: string;
  email: string | null;
  userId: string;
  userAuth?: {
    email: string | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type AvaliacaoResumo = {
  id: string;
  tipo: string;
  objetivo: string;
  peso: number | null;
  altura: number | null;
  abdomen: number | null;
  quadril: number | null;
  braco: number | null;
  coxa: number | null;
  gluteo: number | null;
  frequencia: number | null;
  nivelAtividade: string | null;
  createdAt: Date;
};

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-vip-digital.vercel.app"
  ).replace(/\/$/, "");
}

function getBioFormUrl(studentId: string): string {
  return `${getAppBaseUrl()}/avaliacao?studentId=${encodeURIComponent(studentId)}`;
}

function getFeedbackReviewUrl(): string {
  return `${getAppBaseUrl()}/dashboard/feedbacks-evolucao`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStudentEmail(student: StudentForFeedback): string | null {
  return student.email || student.userAuth?.email || null;
}

function formatDatePtBr(date?: Date | null): string {
  if (!date) return "não informado";

  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatNumber(value?: number | null, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "não informado";
  }

  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}${suffix}`;
}

function diffText(label: string, before?: number | null, after?: number | null, suffix = ""): string | null {
  if (before === null || before === undefined || after === null || after === undefined) {
    return null;
  }

  const diff = Number(after) - Number(before);
  const signal = diff > 0 ? "+" : "";

  return `${label}: ${formatNumber(before, suffix)} → ${formatNumber(after, suffix)} (${signal}${formatNumber(diff, suffix)})`;
}

function buildFeedbackDraft({
  student,
  milestone,
  completedWorkouts,
  baseline,
  current,
}: {
  student: StudentForFeedback;
  milestone: number;
  completedWorkouts: number;
  baseline: AvaliacaoResumo;
  current: AvaliacaoResumo;
}): string {
  const comparisons = [
    diffText("Peso", baseline.peso, current.peso, " kg"),
    diffText("Abdômen", baseline.abdomen, current.abdomen, " cm"),
    diffText("Quadril", baseline.quadril, current.quadril, " cm"),
    diffText("Braço", baseline.braco, current.braco, " cm"),
    diffText("Coxa", baseline.coxa, current.coxa, " cm"),
    diffText("Glúteo", baseline.gluteo, current.gluteo, " cm"),
  ].filter(Boolean);

  const comparisonText =
    comparisons.length > 0
      ? comparisons.map((item) => `- ${item}`).join("\n")
      : "- Ainda não há medidas suficientes preenchidas para comparação numérica completa.";

  return [
    `${student.name}, parabéns por chegar ao marco de ${milestone} treinos concluídos!`,
    "",
    `Até aqui, você já registrou ${completedWorkouts} treino(s) concluído(s). Esse acompanhamento mostra seu compromisso com o processo e ajuda seu professor a orientar os próximos passos com mais segurança.`,
    "",
    "Comparação das avaliações:",
    `Avaliação anterior: ${formatDatePtBr(baseline.createdAt)}`,
    `Avaliação atual: ${formatDatePtBr(current.createdAt)}`,
    comparisonText,
    "",
    "Leitura do acompanhamento:",
    "Sua evolução deve ser analisada considerando treino, constância, medidas, rotina e preenchimento correto das avaliações. O mais importante agora é manter regularidade para que os resultados continuem aparecendo de forma consistente.",
    "",
    "Próximo foco sugerido:",
    "- manter a frequência semanal dos treinos;",
    "- registrar todos os treinos concluídos;",
    "- sinalizar dúvidas ao professor pelo sistema;",
    "- seguir evoluindo com constância, sem pular etapas.",
    "",
    "Seguimos acompanhando sua jornada. Conte com a Funcional para apoiar sua evolução.",
  ].join("\n");
}

async function getAuthorId(): Promise<string | null> {
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

async function sendStudentBioRequestEmail({
  student,
  milestone,
}: {
  student: StudentForFeedback;
  milestone: number;
}) {
  const to = getStudentEmail(student);
  if (!to) return false;

  const title = "Hora de atualizar sua avaliação";
  const bioFormUrl = getBioFormUrl(student.id);
  const safeName = escapeHtml(student.name || "Aluno");

  const text = [
    `Olá, ${student.name}!`,
    "",
    `Você chegou ao marco de ${milestone} treinos concluídos.`,
    "",
    "Para prepararmos um feedback de evolução mais preciso, precisamos que você preencha uma nova avaliação/bioimpedância.",
    "Sem essa atualização, não conseguimos comparar seus dados com segurança.",
    "",
    `Preencha aqui: ${bioFormUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:600px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${title}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${safeName}</strong>!
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          Você chegou ao marco de <strong>${milestone} treinos concluídos</strong>.
          Para prepararmos um feedback de evolução mais preciso, precisamos que você preencha uma nova avaliação/bioimpedância.
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          Sem essa atualização, não conseguimos comparar seus dados com segurança.
        </p>

        <a href="${bioFormUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Preencher avaliação
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
          Este é um aviso automático do Funcional Vip Digital.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: title,
    text,
    html,
  });

  return true;
}

async function sendProfessorReadyEmail({
  student,
  milestone,
}: {
  student: StudentForFeedback;
  milestone: number;
}) {
  const professorEmail = student.user?.email;
  if (!professorEmail) return false;

  const professorName = student.user?.name || "Professor";
  const reviewUrl = getFeedbackReviewUrl();
  const title = "Feedback de evolução pronto para revisão";

  const text = [
    `Olá, ${professorName}.`,
    "",
    `O aluno ${student.name} chegou ao marco de ${milestone} treinos concluídos e já possui nova avaliação/bioimpedância preenchida.`,
    "",
    "O rascunho do feedback de evolução está pronto para revisão.",
    "",
    `Revisar feedback: ${reviewUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:620px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#D4A373; margin:0 0 16px;">${title}</h2>

        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">
          Olá, <strong>${escapeHtml(professorName)}</strong>.
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          O aluno <strong>${escapeHtml(student.name)}</strong> chegou ao marco de <strong>${milestone} treinos concluídos</strong> e já possui nova avaliação/bioimpedância preenchida.
        </p>

        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
          O rascunho do feedback de evolução está pronto para revisão.
        </p>

        <a href="${reviewUrl}" style="display:inline-block; background:#D4A373; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">
          Revisar feedback
        </a>

        <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">
          Este é um aviso automático do Funcional Vip Digital.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to: professorEmail,
    subject: title,
    text,
    html,
  });

  return true;
}

async function processStudent({
  student,
  authorId,
}: {
  student: StudentForFeedback;
  authorId: string;
}) {
  const completedWorkouts = await prisma.workout.count({
    where: {
      studentId: student.id,
      status: "CONCLUIDO",
    },
  });

  const milestone = Math.floor(completedWorkouts / 20) * 20;

  if (milestone < 20) {
    return {
      studentId: student.id,
      studentName: student.name,
      skipped: true,
      reason: "Ainda não chegou a 20 treinos concluídos",
      completedWorkouts,
    };
  }

  const existingFeedback = await prisma.evolutionFeedback.findUnique({
    where: {
      studentId_milestone: {
        studentId: student.id,
        milestone,
      },
    },
  });

  if (existingFeedback?.status === "ENVIADO") {
    return {
      studentId: student.id,
      studentName: student.name,
      skipped: true,
      reason: "Feedback deste marco já enviado",
      completedWorkouts,
      milestone,
    };
  }

  const avaliacoes = (await prisma.avaliacao.findMany({
    where: {
      alunoId: student.id,
    },
    select: {
      id: true,
      tipo: true,
      objetivo: true,
      peso: true,
      altura: true,
      abdomen: true,
      quadril: true,
      braco: true,
      coxa: true,
      gluteo: true,
      frequencia: true,
      nivelAtividade: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  })) as AvaliacaoResumo[];

  const latestAvaliacao = avaliacoes[0] || null;
  const previousAvaliacao = avaliacoes[1] || null;

  const lastSentFeedback = await prisma.evolutionFeedback.findFirst({
    where: {
      studentId: student.id,
      status: "ENVIADO",
      milestone: {
        lt: milestone,
      },
    },
    orderBy: {
      milestone: "desc",
    },
  });

  const latestAlreadyUsed =
    Boolean(lastSentFeedback?.currentAvaliacaoId) &&
    latestAvaliacao?.id === lastSentFeedback?.currentAvaliacaoId;

  const needsNewBio =
    !latestAvaliacao ||
    !previousAvaliacao ||
    latestAlreadyUsed;

  if (needsNewBio) {
    const feedback = existingFeedback || await prisma.evolutionFeedback.create({
      data: {
        studentId: student.id,
        professorId: student.userId,
        milestone,
        status: "AGUARDANDO_BIOIMPEDANCIA",
        completedWorkoutsCount: completedWorkouts,
        baselineAvaliacaoId: previousAvaliacao?.id || null,
        currentAvaliacaoId: latestAvaliacao?.id || null,
      },
    });

    if (feedback.bioRequestNoticeId) {
      return {
        studentId: student.id,
        studentName: student.name,
        status: feedback.status,
        skipped: true,
        reason: "Pedido de bioimpedância já enviado",
        completedWorkouts,
        milestone,
      };
    }

    const bioFormUrl = getBioFormUrl(student.id);
    const title = "Hora de atualizar sua avaliação";
    const content = [
      "Chegou a hora de atualizar sua avaliação!",
      "",
      `Você concluiu uma etapa importante do seu acompanhamento: ${milestone} treinos concluídos.`,
      "",
      "Para que possamos comparar sua evolução e preparar um feedback mais preciso, preencha sua nova bioimpedância/formulário.",
      "",
      "Sem essa atualização, não conseguimos comparar seus dados com segurança.",
      "",
      `Clique aqui para preencher: ${bioFormUrl}`,
    ].join("\n");

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        type: "BIOIMPEDANCIA_PENDENTE_FEEDBACK",
        targetRole: "ALUNO",
        studentId: student.id,
        authorId,
      },
      select: {
        id: true,
      },
    });

    let emailSent = false;

    try {
      emailSent = await sendStudentBioRequestEmail({
        student,
        milestone,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de pedido de bioimpedância:", error);
    }

    await prisma.evolutionFeedback.update({
      where: {
        id: feedback.id,
      },
      data: {
        status: "AGUARDANDO_BIOIMPEDANCIA",
        completedWorkoutsCount: completedWorkouts,
        bioRequestNoticeId: notice.id,
        bioRequestedAt: new Date(),
        professorId: student.userId,
        baselineAvaliacaoId: previousAvaliacao?.id || null,
        currentAvaliacaoId: latestAvaliacao?.id || null,
      },
    });

    return {
      studentId: student.id,
      studentName: student.name,
      action: "BIO_REQUESTED",
      emailSent,
      completedWorkouts,
      milestone,
    };
  }

  const baseline = previousAvaliacao;
  const current = latestAvaliacao;

  const draft = buildFeedbackDraft({
    student,
    milestone,
    completedWorkouts,
    baseline,
    current,
  });

  const feedback = existingFeedback
    ? await prisma.evolutionFeedback.update({
        where: {
          id: existingFeedback.id,
        },
        data: {
          status: "PRONTO_REVISAO",
          completedWorkoutsCount: completedWorkouts,
          professorId: student.userId,
          baselineAvaliacaoId: baseline.id,
          currentAvaliacaoId: current.id,
          draft,
          readyAt: existingFeedback.readyAt || new Date(),
        },
      })
    : await prisma.evolutionFeedback.create({
        data: {
          studentId: student.id,
          professorId: student.userId,
          milestone,
          status: "PRONTO_REVISAO",
          completedWorkoutsCount: completedWorkouts,
          baselineAvaliacaoId: baseline.id,
          currentAvaliacaoId: current.id,
          draft,
          readyAt: new Date(),
        },
      });

  if (feedback.professorNoticeId) {
    return {
      studentId: student.id,
      studentName: student.name,
      status: "PRONTO_REVISAO",
      skipped: true,
      reason: "Professor já foi avisado",
      completedWorkouts,
      milestone,
    };
  }

  const title = "Feedback de evolução pronto para revisão";
  const content = [
    `O aluno ${student.name} chegou ao marco de ${milestone} treinos concluídos.`,
    "",
    "A nova avaliação/bioimpedância já está preenchida e o rascunho do feedback está pronto.",
    "",
    `Acesse para revisar e enviar: ${getFeedbackReviewUrl()}`,
  ].join("\n");

  const notice = await prisma.notice.create({
    data: {
      title,
      content,
      type: "FEEDBACK_EVOLUCAO_REVISAO",
      targetRole: "PROFESSOR",
      professorId: student.userId,
      authorId,
    },
    select: {
      id: true,
    },
  });

  let emailSent = false;

  try {
    emailSent = await sendProfessorReadyEmail({
      student,
      milestone,
    });
  } catch (error) {
    console.error("Erro ao enviar e-mail para professor revisar feedback:", error);
  }

  await prisma.evolutionFeedback.update({
    where: {
      id: feedback.id,
    },
    data: {
      professorNoticeId: notice.id,
    },
  });

  return {
    studentId: student.id,
    studentName: student.name,
    action: "READY_FOR_REVIEW",
    professorEmailSent: emailSent,
    completedWorkouts,
    milestone,
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorId = await getAuthorId();

  if (!authorId) {
    return NextResponse.json(
      { error: "Nenhum gestor/admin encontrado para assinar os avisos." },
      { status: 400 }
    );
  }

  const students = (await prisma.student.findMany({
    where: {
      active: true,
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
    orderBy: {
      name: "asc",
    },
  })) as StudentForFeedback[];

  const eligibleStudents = students.filter((student) => Boolean(student.userId));
  const results: any[] = [];
  const errors: any[] = [];

  for (const student of eligibleStudents) {
    try {
      const result = await processStudent({
        student,
        authorId,
      });

      results.push(result);
    } catch (error: any) {
      errors.push({
        studentId: student.id,
        studentName: student.name,
        message: error?.message || "Erro desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    totals: {
      eligibleStudents: eligibleStudents.length,
      processed: results.length,
      bioRequested: results.filter((item) => item.action === "BIO_REQUESTED").length,
      readyForReview: results.filter((item) => item.action === "READY_FOR_REVIEW").length,
      errors: errors.length,
    },
    results,
    errors,
  });
}
