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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = String(sessionUser.id);
    const role = normalizeRole(String(sessionUser.role || ""));
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
        studentId: true,
        teacherId: true,
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
        resolvedAt: true,
      },
    });

    if (!rootQuestion) {
      return NextResponse.json({ error: "Conversa principal não encontrada" }, { status: 404 });
    }

    const canClose =
      role === "GESTOR" ||
      role === "ADMIN" ||
      ((role === "TEACHER" || role === "PROFESSOR") && rootQuestion.teacherId === userId);

    if (!canClose) {
      return NextResponse.json(
        { error: "Você não tem permissão para encerrar esta conversa" },
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
