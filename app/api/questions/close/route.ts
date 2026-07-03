import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";

function normalizeRole(value?: string | null): string {
  const roleValue = String(value || "").toUpperCase();

  if (roleValue === "PROFESSOR") return "TEACHER";
  if (roleValue === "ALUNO") return "STUDENT";

  return roleValue;
}

function isManagerRole(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = String(sessionUser.id);
    const currentRole = normalizeRole(String(sessionUser.role || ""));

    const body = await req.json().catch(() => ({}));
    const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";

    if (!questionId) {
      return NextResponse.json({ error: "questionId é obrigatório" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!question) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const rootQuestionId = question.parentId || question.id;

    const rootQuestion = await prisma.question.findUnique({
      where: { id: rootQuestionId },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        senderRole: true,
        answeredById: true,
        resolvedAt: true,
        student: {
          select: {
            id: true,
            userAuthId: true,
          },
        },
      },
    });

    if (!rootQuestion) {
      return NextResponse.json({ error: "Conversa principal não encontrada" }, { status: 404 });
    }

    const openerRole = normalizeRole(rootQuestion.senderRole);

    let canClose = false;

    if (openerRole === "STUDENT") {
      // Aluno abriu a conversa/dúvida.
      // Só o próprio aluno logado pode encerrar.
      canClose =
        currentRole === "STUDENT" &&
        Boolean(rootQuestion.student?.userAuthId) &&
        rootQuestion.student?.userAuthId === userId;
    } else if (openerRole === "TEACHER") {
      // Professor abriu a conversa.
      // Só o professor que abriu pode encerrar.
      canClose =
        currentRole === "TEACHER" &&
        Boolean(rootQuestion.teacherId) &&
        rootQuestion.teacherId === userId;
    } else if (isManagerRole(openerRole)) {
      // Gestão abriu a conversa.
      // Só o gestor/admin que abriu pode encerrar.
      // Para isso, a pergunta raiz precisa ter answeredById com o id de quem abriu.
      canClose =
        isManagerRole(currentRole) &&
        Boolean(rootQuestion.answeredById) &&
        rootQuestion.answeredById === userId;
    }

    if (!canClose) {
      return NextResponse.json(
        {
          error:
            "Apenas quem abriu esta conversa pode encerrá-la.",
        },
        { status: 403 }
      );
    }

    const updatedQuestion = await prisma.question.update({
      where: { id: rootQuestionId },
      data: {
        resolvedAt: rootQuestion.resolvedAt || new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        answeredBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        children: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
            answeredBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      question: updatedQuestion,
    });
  } catch (error) {
    console.error("POST /api/questions/close error:", error);
    return NextResponse.json(
      { error: "Erro ao encerrar conversa" },
      { status: 500 }
    );
  }
}
