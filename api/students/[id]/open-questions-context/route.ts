import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { isStudentAssignedToProfessor } from "@/lib/student-professor";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : "";
    const role = normalizeRole(user?.role);
    const studentId = String(params?.id || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const canAccess =
      role === "GESTOR" ||
      role === "ADMIN" ||
      (role === "TEACHER" && (await isStudentAssignedToProfessor(studentId, userId)));

    if (!canAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const questions = await prisma.question.findMany({
      where: {
        studentId,
        parentId: null,
        resolvedAt: null,
      },
      include: {
        children: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            senderRole: true,
            createdAt: true,
          },
        },
        teacher: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const openQuestions = questions.map((question) => {
      const messages = [
        {
          id: question.id,
          senderRole: question.senderRole,
          content: question.content,
          createdAt: question.createdAt,
        },
        ...question.children,
      ].map((message) => ({
        id: message.id,
        senderRole: String(message.senderRole || ""),
        content: String(message.content || "").trim(),
        createdAt: message.createdAt.toISOString(),
      }));

      const lastMessage = messages[messages.length - 1] || null;
      const conversationText = messages
        .filter((message) => message.content)
        .map((message) => {
          const roleLabel = String(message.senderRole || "").toUpperCase().includes("STUDENT") || String(message.senderRole || "").toUpperCase().includes("ALUNO")
            ? "Aluno"
            : "Professor/gestão";
          return `${roleLabel}: ${message.content}`;
        })
        .join("\n");

      return {
        id: question.id,
        createdAt: question.createdAt.toISOString(),
        teacherName: question.teacher?.name || null,
        lastMessage: lastMessage?.content || null,
        conversationText,
        messages,
      };
    });

    return NextResponse.json({
      ok: true,
      studentId: student.id,
      studentName: student.name,
      count: openQuestions.length,
      openQuestions,
    });
  } catch (error: any) {
    console.error("GET /api/students/[id]/open-questions-context error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}
