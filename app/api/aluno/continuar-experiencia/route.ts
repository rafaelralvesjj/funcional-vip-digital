import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function buildStudentWhere(userId?: string | null, email?: string | null) {
  const orWhere: any[] = [];
  const normalizedEmail = normalizeEmail(email);

  if (userId) {
    orWhere.push({ userAuthId: userId });
    orWhere.push({ userId });
  }

  if (normalizedEmail) {
    orWhere.push({ email: { equals: normalizedEmail, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: normalizedEmail, mode: "insensitive" } } });
  }

  return orWhere;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as
      | { id?: string; email?: string | null; name?: string | null }
      | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const orWhere = buildStudentWhere(sessionUser.id, sessionUser.email);

    if (!orWhere.length) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem identificação suficiente." },
        { status: 400 }
      );
    }

    const today = startOfDay(new Date());

    const student = await prisma.student.findFirst({
      where: {
        active: true,
        OR: orWhere,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        userAuth: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        contracts: {
          where: {
            type: "TRIAL",
            status: {
              in: ["ACTIVE", "AWAITING_PAYMENT"],
            },
          },
          orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Aluno não encontrado para o usuário autenticado." },
        { status: 404 }
      );
    }

    const trialContract = student.contracts.find((contract) => {
      const endDate = startOfDay(new Date(contract.endDate));
      return endDate.getTime() >= today.getTime();
    });

    if (!trialContract) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não encontramos uma experiência gratuita ativa para registrar o interesse de continuidade.",
        },
        { status: 400 }
      );
    }

    const existingEvent = await prisma.studentCareEvent.findFirst({
      where: {
        studentId: student.id,
        contractId: trialContract.id,
        eventType: "TRIAL_CONTINUATION_REQUEST",
        status: {
          in: ["ABERTO", "EM_ANDAMENTO", "PENDENTE"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingEvent) {
      return NextResponse.json({
        ok: true,
        alreadyRequested: true,
        message:
          "Seu pedido já está com a gestão. Que bom saber que você quer continuar! Assim que houver uma atualização, a equipe vai orientar os próximos passos.",
      });
    }

    const authorId = student.userAuthId || sessionUser.id || student.userId;
    const studentName = student.name || student.userAuth?.name || sessionUser.name || "Aluno";
    const studentEmail = student.email || student.userAuth?.email || sessionUser.email || null;

    const notice = await prisma.notice.create({
      data: {
        title: `${studentName} quer continuar com o acompanhamento`,
        content: [
          "Olá, equipe de gestão.",
          "",
          `${studentName} sinalizou, pelo painel do aluno, que deseja continuar após a experiência gratuita.`,
          studentEmail ? `E-mail: ${studentEmail}.` : null,
          "Próximo passo: acessar o Financeiro, avaliar o plano mais adequado e entrar em contato para orientar a continuidade.",
          "",
          "Mensagem automática gerada a partir da manifestação do aluno.",
        ].filter(Boolean).join("\n"),
        type: "COMERCIAL",
        targetRole: "GESTOR",
        authorId,
        studentId: student.id,
      },
    });

    await prisma.studentCareEvent.create({
      data: {
        studentId: student.id,
        professorId: trialContract.professorId || null,
        authorId,
        eventType: "TRIAL_CONTINUATION_REQUEST",
        severity: "ATENCAO",
        status: "ABERTO",
        source: "APP_ALUNO",
        title: `${studentName} quer continuar com o acompanhamento`,
        description: `${studentName} clicou em “Quero continuar” no painel do aluno durante a experiência gratuita.`,
        studentMessage:
          "Que bom saber que você quer continuar! Seu pedido já foi encaminhado para a gestão, que vai avaliar as opções e orientar os próximos passos.",
        professorMessage:
          `${studentName} quer continuar após a experiência gratuita. A gestão deve avaliar a conversão e alinhar o próximo plano com o aluno.`,
        contractId: trialContract.id,
        professorNoticeId: notice.id,
      },
    });

    const notifyEmail = process.env.TRIAL_CONTINUATION_NOTIFY_EMAIL;

    if (notifyEmail) {
      try {
        await sendEmail({
          to: notifyEmail,
          subject: `${studentName} quer continuar com o acompanhamento`,
          text: [
            "Olá, equipe de gestão.",
            "",
            `${studentName} sinalizou que deseja continuar após a experiência gratuita.`,
            `E-mail do aluno: ${studentEmail || "não informado"}.`,
            "Acesse o Financeiro para avaliar o plano mais adequado e orientar os próximos passos.",
            "",
            "Mensagem automática gerada a partir da manifestação do aluno.",
          ].join("\n"),
          html: `
            <div style="font-family: Arial, sans-serif; line-height:1.6; color:#222;">
              <h2>${studentName} quer continuar com o acompanhamento</h2>
              <p>Olá, equipe de gestão.</p>
              <p><strong>${studentName}</strong> sinalizou, pelo painel, que deseja continuar após a experiência gratuita.</p>
              <p><strong>E-mail:</strong> ${studentEmail || "não informado"}</p>
              <p>Próximo passo: acessar o Financeiro, avaliar o plano mais adequado e entrar em contato para orientar a continuidade.</p>
              <p style="font-size:12px; color:#666;">Mensagem automática gerada a partir da manifestação do aluno.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Erro ao enviar e-mail de interesse em continuar", emailError);
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyRequested: false,
      message:
        "Que bom saber que você quer continuar! Seu pedido já foi encaminhado para a gestão, que vai avaliar as opções e orientar os próximos passos.",
    });
  } catch (error) {
    console.error("Erro ao registrar interesse em continuar após experiência", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao registrar interesse em continuar após experiência.",
      },
      { status: 500 }
    );
  }
}
