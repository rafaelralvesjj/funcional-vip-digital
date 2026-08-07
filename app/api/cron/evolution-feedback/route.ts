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
    "https://funcional-up-digital.vercel.app"
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

  const comparisonText = comparisons.length > 0
    ? comparisons.map((item) => `- ${item}`).join("\n")
    : "- Ainda não há medidas suficientes preenchidas para uma comparação numérica completa.";
  const professorName = student.user?.name || "seu professor";

  return [
    `Oi, ${student.name}!`,
    "",
    `Você chegou ao marco de ${milestone} treinos concluídos. Esse momento merece uma pausa para reconhecer sua constância e olhar com atenção para o que mudou ao longo do ciclo.`,
    "",
    `Até aqui, você registrou ${completedWorkouts} treino(s) concluído(s). Esses registros me ajudam a entender melhor sua rotina e tomar decisões mais seguras para os próximos passos.`,
    "",
    "Comparação das avaliações:",
    `Avaliação anterior: ${formatDatePtBr(baseline.createdAt)}`,
    `Avaliação atual: ${formatDatePtBr(current.createdAt)}`,
    comparisonText,
    "",
    "Minha leitura deste ciclo:",
    "[Professor: personalize este parágrafo considerando constância, resposta aos treinos, objetivo do aluno, medidas e contexto atual.]",
    "",
    "Próximo foco combinado:",
    "[Professor: escreva aqui um foco claro e possível para o próximo ciclo.]",
    "",
    "Continue registrando os treinos e use o chat para me avisar sobre dúvidas, dificuldades, dor ou mudanças na rotina. Assim, consigo acompanhar sua evolução com mais contexto.",
    "",
    professorName,
    "Funcional UP Digital",
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

  const professorName = student.user?.name || "seu professor";
  const title = "Vamos atualizar sua avaliação para olhar sua evolução";
  const bioFormUrl = getBioFormUrl(student.id);
  const safeName = escapeHtml(student.name || "Aluno");
  const safeProfessorName = escapeHtml(professorName);

  const text = [
    `Oi, ${student.name}! Aqui é ${professorName}.`,
    "",
    `Você chegou ao marco de ${milestone} treinos concluídos. Antes de preparar sua devolutiva de evolução, preciso que você atualize sua avaliação/bioimpedância.`,
    "Essa atualização permite comparar os dados com mais cuidado e evita conclusões baseadas em informações antigas.",
    "Reserve alguns minutos para preencher com calma. Se tiver dúvida sobre o formulário, fale comigo pelo chat da plataforma.",
    "",
    `Preencher avaliação: ${bioFormUrl}`,
    "",
    professorName,
    "Funcional UP Digital",
    "Mensagem automática de acompanhamento enviada em nome do seu professor.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:600px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#00A19C; margin:0 0 16px;">${title}</h2>
        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeName}</strong>! Aqui é <strong>${safeProfessorName}</strong>.</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Você chegou ao marco de <strong>${milestone} treinos concluídos</strong>. Antes de preparar sua devolutiva, preciso que você atualize sua avaliação/bioimpedância.</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Essa atualização permite comparar os dados com mais cuidado e evita conclusões baseadas em informações antigas. Preencha com calma e, se tiver dúvida, fale comigo pelo chat da plataforma.</p>
        <a href="${bioFormUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Atualizar minha avaliação</a>
        <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional UP Digital</p>
        <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática de acompanhamento enviada em nome do seu professor.</p>
      </div>
    </div>
  `;

  await sendEmail({ to, subject: title, text, html, eventType: "EVOLUTION_ASSESSMENT_REQUEST", recipientType: "STUDENT", contextId: student.id });
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
  const title = `Devolutiva de ${student.name} pronta para sua revisão`;

  const text = [
    `Oi, ${professorName}.`,
    "",
    `${student.name} chegou ao marco de ${milestone} treinos concluídos e já atualizou a avaliação/bioimpedância.`,
    "O sistema preparou um rascunho para apoiar sua análise, mas a mensagem precisa da sua leitura e personalização antes de chegar ao aluno.",
    "Revise o histórico, ajuste a interpretação e deixe um próximo foco claro e humano.",
    "",
    `Revisar devolutiva: ${reviewUrl}`,
    "",
    "Gestão Funcional UP Digital",
    "Mensagem automática de acompanhamento.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
      <div style="max-width:620px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
        <h2 style="color:#00A19C; margin:0 0 16px;">${escapeHtml(title)}</h2>
        <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${escapeHtml(professorName)}</strong>.</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;"><strong>${escapeHtml(student.name)}</strong> chegou ao marco de <strong>${milestone} treinos concluídos</strong> e já atualizou a avaliação/bioimpedância.</p>
        <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">O sistema preparou um rascunho para apoiar sua análise, mas a mensagem precisa da sua leitura e personalização antes de chegar ao aluno.</p>
        <a href="${reviewUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:12px;">Revisar devolutiva</a>
        <p style="color:#6b6b6b; font-size:11px; margin-top:20px;">Mensagem automática de acompanhamento.</p>
      </div>
    </div>
  `;

  await sendEmail({ to: professorEmail, subject: title, text, html, eventType: "EVOLUTION_FEEDBACK_READY", recipientType: "TEACHER", contextId: student.id });
  return true;
}

async function processStudent({
  student,
  authorId,
}: {
  student: StudentForFeedback;
  authorId: string;
}) {
  const now = new Date();

  const activeContract = await prisma.studentContract.findFirst({
    where: {
      studentId: student.id,
      status: "ACTIVE",
      startDate: {
        lte: now,
      },
      endDate: {
        gte: now,
      },
    },
    orderBy: {
      endDate: "desc",
    },
    select: {
      id: true,
      contractNumber: true,
      startDate: true,
      endDate: true,
      totalContractedWorkouts: true,
    },
  });

  if (!activeContract) {
    return {
      studentId: student.id,
      studentName: student.name,
      skipped: true,
      reason: "Aluno sem contrato ativo. Feedback de evolução não deve considerar contrato antigo.",
      completedWorkouts: 0,
    };
  }

  const completedWorkouts = await prisma.workout.count({
    where: {
      studentId: student.id,
      contractId: activeContract.id,
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

  const existingFeedback = await prisma.evolutionFeedback.findFirst({
    where: {
      studentId: student.id,
      contractId: activeContract.id,
      milestone,
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
      contractId: activeContract.id,
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
        contractId: activeContract.id,
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
    const professorName = student.user?.name || "seu professor";
    const title = "Vamos atualizar sua avaliação para olhar sua evolução";
    const content = [
      `Oi, ${student.name}! Aqui é ${professorName}.`,
      "",
      `Você chegou ao marco de ${milestone} treinos concluídos. Antes de preparar sua devolutiva de evolução, preciso que atualize sua avaliação/bioimpedância.`,
      "Essa atualização permite comparar seus dados com mais cuidado e evita conclusões baseadas em informações antigas.",
      "Reserve alguns minutos para preencher com calma. Se tiver dúvida, fale comigo pelo chat da plataforma.",
      "",
      `Atualizar avaliação: ${bioFormUrl}`,
      "",
      professorName,
      "Funcional UP Digital",
      "Mensagem automática de acompanhamento enviada em nome do seu professor.",
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
        contractId: activeContract.id,
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
          contractId: activeContract.id,
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
          contractId: activeContract.id,
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

  const title = `Devolutiva de ${student.name} pronta para revisão`;
  const content = [
    `Oi, ${student.user?.name || "professor(a)"}.`,
    "",
    `${student.name} chegou ao marco de ${milestone} treinos concluídos e já atualizou a avaliação/bioimpedância.`,
    "O sistema preparou um rascunho para apoiar sua análise. Antes de enviar, revise o histórico, personalize a leitura e deixe um próximo foco claro para o aluno.",
    "",
    `Revisar e enviar: ${getFeedbackReviewUrl()}`,
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
