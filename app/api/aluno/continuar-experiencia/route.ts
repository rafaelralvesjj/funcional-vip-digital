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
          "Seu interesse em continuar já está registrado. A equipe irá acompanhar seu pedido.",
      });
    }

    const authorId = student.userAuthId || sessionUser.id || student.userId;
    const studentName = student.name || student.userAuth?.name || sessionUser.name || "Aluno";
    const studentEmail = student.email || student.userAuth?.email || sessionUser.email || null;

    const notice = await prisma.notice.create({
      data: {
        title: "Aluno quer continuar após experiência",
        content: `${studentName} sinalizou interesse em continuar após a experiência gratuita. Acesse o Financeiro para avaliar a conversão para um plano pago.`,
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
        title: "Aluno quer continuar após experiência",
        description: `${studentName} clicou em “Quero continuar” no painel do aluno durante a experiência gratuita.`,
        studentMessage:
          "Recebemos seu interesse em continuar. A equipe irá acompanhar seu pedido e orientar os próximos passos.",
        professorMessage:
          "Aluno sinalizou interesse em continuar após a experiência gratuita. Avaliar conversão para plano pago.",
        contractId: trialContract.id,
        professorNoticeId: notice.id,
      },
    });

    const notifyEmail = process.env.TRIAL_CONTINUATION_NOTIFY_EMAIL;

    if (notifyEmail) {
      try {
        await sendEmail({
          to: notifyEmail,
          subject: "Aluno quer continuar após experiência",
          text: `${studentName} sinalizou interesse em continuar após a experiência gratuita. E-mail do aluno: ${studentEmail || "não informado"}.`,
          html: `
            <p><strong>${studentName}</strong> sinalizou interesse em continuar após a experiência gratuita.</p>
            <p><strong>E-mail:</strong> ${studentEmail || "não informado"}</p>
            <p>Acesse o Financeiro para avaliar a conversão para um plano pago.</p>
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
        "Recebemos seu interesse em continuar. A equipe irá acompanhar seu pedido e orientar os próximos passos.",
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
