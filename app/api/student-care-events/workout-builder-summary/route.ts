import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : "";
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const studentId = String(
      request.nextUrl.searchParams.get("studentId") || ""
    ).trim();

    if (!studentId) {
      return NextResponse.json(
        { error: "ID do aluno é obrigatório." },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        userId: true,
        userAuthId: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado." },
        { status: 404 }
      );
    }

    const hasAccess =
      role === "GESTOR" ||
      role === "ADMIN" ||
      (role === "TEACHER" && student.userId === userId) ||
      (role === "STUDENT" && student.userAuthId === userId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    /*
     * Retorna somente os campos necessários para a tela Montar treino.
     * Não inclui aluno, professor, contrato, treino relacionado ou cálculo
     * comercial, evitando o JSON grande da rota completa de cuidado.
     */
    const events = await prisma.studentCareEvent.findMany({
      where: {
        studentId,
        status: {
          not: "RESOLVIDO",
        },
      },
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        title: true,
        description: true,
        professorMessage: true,
        resolutionNotes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          createdAt: "desc",
        },
      ],
      take: 20,
    });

    return NextResponse.json(
      {
        events,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error(
      "GET /api/student-care-events/workout-builder-summary error:",
      error
    );

    return NextResponse.json(
      {
        error: "Erro ao consultar o resumo de cuidado.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
