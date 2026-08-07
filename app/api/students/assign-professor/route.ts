import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").trim().toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEmail(value?: string | null): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function buildProfessorAssignmentContent({
  professorName,
  studentName,
  studentEmail,
  commercialStatus,
}: {
  professorName?: string | null;
  studentName: string;
  studentEmail?: string | null;
  commercialStatus?: string | null;
}): string {
  const status = String(commercialStatus || "SEM_CONTRATO_ATIVO").toUpperCase();

  const statusLabel: Record<string, string> = {
    EXPERIENCIA_ATIVA: "experiência ativa",
    CONTRATO_ATIVO: "contrato ativo",
    AGUARDANDO_PAGAMENTO: "aguardando confirmação de pagamento",
    SUSPENSO_POR_PAGAMENTO: "acompanhamento pausado por pagamento",
    SEM_CONTRATO_ATIVO: "sem contrato ativo",
  };

  return [
    `Oi, ${professorName || "professor(a)"}!`,
    "",
    `A gestão vinculou ${studentName} ao seu acompanhamento.`,
    studentEmail ? `E-mail do aluno: ${studentEmail}.` : null,
    `Situação atual: ${statusLabel[status] || status}.`,
    "",
    status === "EXPERIENCIA_ATIVA" || status === "CONTRATO_ATIVO"
      ? "Você já pode abrir a ficha, conhecer o contexto do aluno e preparar os treinos da semana."
      : "O aluno já aparece no seu painel para acompanhamento. A liberação de novos treinos dependerá de uma experiência ou contrato ativo no Financeiro.",
    "Antes de montar o primeiro treino, confira objetivo, histórico, dores, restrições, ambiente e equipamentos disponíveis.",
    "Use o chat da plataforma como canal principal com o aluno. Assim, dúvidas, orientações e decisões ficam registradas no histórico de acompanhamento.",
    "",
    "Gestão do Funcional UP Digital",
    "Mensagem automática enviada após o vínculo do aluno.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyProfessorAssignment({
  authorId,
  professorId,
  student,
}: {
  authorId: string;
  professorId: string;
  student: {
    id: string;
    name: string;
    email?: string | null;
    commercialStatus?: string | null;
  };
}) {
  /*
   * A busca é repetida aqui de propósito. O e-mail de vínculo nunca pode usar
   * o autor da ação, um gestor ou qualquer vínculo legado do aluno como
   * destinatário. Somente um usuário ativo com papel de professor é aceito.
   */
  const professor = await prisma.user.findFirst({
    where: {
      id: professorId,
      active: true,
      role: {
        in: ["PROFESSOR", "TEACHER"],
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!professor || normalizeRole(professor.role) !== "TEACHER") {
    throw new Error(
      "O destinatário do aviso de vínculo não é um professor ativo. O e-mail não foi enviado."
    );
  }

  const recipientEmail = normalizeEmail(professor.email);
  const title = "Um novo aluno chegou ao seu acompanhamento";
  const content = buildProfessorAssignmentContent({
    professorName: professor.name,
    studentName: student.name,
    studentEmail: student.email,
    commercialStatus: student.commercialStatus,
  });

  const existingNotice = await prisma.notice.findFirst({
    where: {
      title,
      type: "MANAGEMENT",
      targetRole: "TEACHER",
      professorId: professor.id,
      studentId: student.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingNotice) {
    await prisma.notice.create({
      data: {
        title,
        content,
        type: "MANAGEMENT",
        targetRole: "TEACHER",
        authorId,
        professorId: professor.id,
        studentId: student.id,
      },
    });
  }

  if (!recipientEmail) {
    return {
      noticeCreated: !existingNotice,
      emailSent: false,
      emailSkippedReason: "Professor sem e-mail cadastrado.",
      recipientId: professor.id,
      recipientName: professor.name || "Professor",
      recipientEmail: null,
    };
  }

  const loginUrl = getAppLoginUrl();
  const safeProfessorName = escapeHtml(professor.name || "professor(a)");
  const safeStudentName = escapeHtml(student.name);
  const safeStudentEmail = escapeHtml(student.email || "Não informado");

  await sendEmail({
    to: recipientEmail,
    subject: title,
    text: `${content}\n\nAcessar o painel: ${loginUrl}`,
    eventType: "STUDENT_ASSIGNED_TO_TEACHER",
    recipientType: "TEACHER",
    contextId: student.id,
    html: `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#00A19C; margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeProfessorName}</strong>!</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">A gestão vinculou um novo aluno ao seu acompanhamento no Funcional UP Digital.</p>
          <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:14px; margin:16px 0;">
            <p style="color:#f5f5f5; margin:0 0 8px; font-size:14px;"><strong>Aluno:</strong> ${safeStudentName}</p>
            <p style="color:#d4d4d4; margin:0; font-size:13px;"><strong>E-mail:</strong> ${safeStudentEmail}</p>
          </div>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Antes de montar o primeiro treino, abra a ficha e confira objetivo, histórico, dores, restrições, ambiente e equipamentos disponíveis.</p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Use o chat da plataforma como canal principal com o aluno. Assim, dúvidas, orientações e decisões ficam registradas no acompanhamento.</p>
          <a href="${loginUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px; margin-top:8px;">Abrir painel do aluno</a>
          <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">Gestão do Funcional UP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; margin-top:4px;">Mensagem automática enviada após o vínculo do aluno.</p>
        </div>
      </div>
    `,
  });

  return {
    noticeCreated: !existingNotice,
    emailSent: true,
    emailSkippedReason: null,
    recipientId: professor.id,
    recipientName: professor.name || "Professor",
    recipientEmail,
  };
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = normalizeRole(user?.role);

    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!canManage(role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();

    const studentId = String(body?.studentId || "").trim();
    const professorId = String(body?.professorId || "").trim();

    if (!studentId) {
      return NextResponse.json({ error: "Aluno é obrigatório." }, { status: 400 });
    }

    if (!professorId) {
      return NextResponse.json({ error: "Professor é obrigatório." }, { status: 400 });
    }

    const [student, professor] = await Promise.all([
      prisma.student.findUnique({
        where: {
          id: studentId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          userId: true,
          commercialStatus: true,
        },
      }),
      prisma.user.findFirst({
        where: {
          id: professorId,
          active: true,
          role: {
            in: ["PROFESSOR", "TEACHER"],
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      }),
    ]);

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    if (!professor || normalizeRole(professor.role) !== "TEACHER") {
      return NextResponse.json(
        {
          error:
            "O usuário selecionado não é um professor ativo. Gestores e administradores não podem receber vínculo de aluno como professor.",
        },
        { status: 400 }
      );
    }

    const previousProfessorId = student.userId || null;
    const isNewProfessorAssignment = previousProfessorId !== professor.id;

    const result = await prisma.$transaction(async (tx) => {
      const updatedStudent = await tx.student.update({
        where: {
          id: studentId,
        },
        data: {
          userId: professor.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          commercialStatus: true,
          contractedTrainingDaysPerMonth: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
            },
          },
        },
      });

      await tx.studentContract.updateMany({
        where: {
          studentId,
          status: {
            in: ["ACTIVE", "ATIVO"],
          },
        },
        data: {
          professorId: professor.id,
        },
      });

      return updatedStudent;
    });

    if (
      !result.user ||
      result.user.active === false ||
      normalizeRole(result.user.role) !== "TEACHER" ||
      result.user.id !== professor.id
    ) {
      throw new Error(
        "O vínculo foi salvo com um destinatário inválido. A notificação foi interrompida para proteger o envio."
      );
    }

    let professorNotification: {
      noticeCreated: boolean;
      emailSent: boolean;
      emailSkippedReason?: string | null;
      recipientId?: string | null;
      recipientName?: string | null;
      recipientEmail?: string | null;
      error?: string | null;
    } | null = null;

    if (isNewProfessorAssignment) {
      try {
        professorNotification = await notifyProfessorAssignment({
          authorId: String(user.id),
          professorId: result.user.id,
          student: {
            id: result.id,
            name: result.name,
            email: result.email,
            commercialStatus: result.commercialStatus,
          },
        });
      } catch (notificationError: any) {
        console.error("Erro ao notificar professor vinculado:", notificationError);

        professorNotification = {
          noticeCreated: false,
          emailSent: false,
          recipientId: result.user.id,
          recipientName: result.user.name,
          recipientEmail: normalizeEmail(result.user.email),
          error: notificationError?.message || "Erro ao notificar professor.",
        };
      }
    }

    const emailResultText = isNewProfessorAssignment
      ? professorNotification?.emailSent
        ? ` E-mail enviado exclusivamente para ${professorNotification.recipientName || "o professor"}.`
        : professorNotification?.emailSkippedReason
          ? ` ${professorNotification.emailSkippedReason}`
          : professorNotification?.error
            ? ` O vínculo foi salvo, mas o e-mail não foi enviado: ${professorNotification.error}`
            : ""
      : "";

    const baseMessage =
      result.commercialStatus === "CONTRATO_ATIVO" ||
      result.commercialStatus === "EXPERIENCIA_ATIVA"
        ? isNewProfessorAssignment
          ? "Professor vinculado ao aluno e ao contrato ativo."
          : "Professor já estava vinculado ao aluno e ao contrato ativo."
        : isNewProfessorAssignment
          ? "Professor vinculado. Para liberar treinos, crie uma experiência grátis ou contrato no Financeiro."
          : "Professor já estava vinculado. Para liberar treinos, crie uma experiência grátis ou contrato no Financeiro.";

    return NextResponse.json({
      ok: true,
      message: `${baseMessage}${emailResultText}`,
      professorNotification,
      student: {
        id: result.id,
        name: result.name,
        email: result.email,
        commercialStatus: result.commercialStatus,
        contractedTrainingDaysPerMonth: result.contractedTrainingDaysPerMonth,
        professorId: result.user.id,
        professorName: result.user.name,
        professorEmail: normalizeEmail(result.user.email),
      },
    });
  } catch (error: any) {
    console.error("PUT /api/students/assign-professor error:", error);

    return NextResponse.json(
      {
        error: "Erro ao vincular professor.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
