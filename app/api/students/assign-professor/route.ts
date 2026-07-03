import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/auth";

function normalizeRole(role?: string | null) {
  return String(role || "").toUpperCase();
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id && !sessionUser?.email) {
    return null;
  }

  if (sessionUser?.id) {
    const userById = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, role: true, email: true },
    });

    if (userById) return userById;
  }

  if (sessionUser?.email) {
    return prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { id: true, role: true, email: true },
    });
  }

  return null;
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (role !== "GESTOR" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas gestores podem vincular alunos" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const studentId = String(body.studentId || "").trim();
    const professorId = String(body.professorId || "").trim();
    const contractedTrainingDaysPerMonth = parseOptionalInt(
      body.contractedTrainingDaysPerMonth ?? body.trainingDaysPerMonth ?? body.daysPerMonth
    );

    if (!studentId || !professorId) {
      return NextResponse.json(
        { error: "studentId e professorId são obrigatórios" },
        { status: 400 }
      );
    }

    if (
      (body.contractedTrainingDaysPerMonth !== undefined ||
        body.trainingDaysPerMonth !== undefined ||
        body.daysPerMonth !== undefined) &&
      contractedTrainingDaysPerMonth === undefined
    ) {
      return NextResponse.json(
        { error: "Informe uma quantidade válida de dias contratados por mês." },
        { status: 400 }
      );
    }

    const professor = await prisma.user.findFirst({
      where: {
        id: professorId,
        role: { in: ["PROFESSOR", "TEACHER"] },
      },
      select: { id: true },
    });

    if (!professor) {
      return NextResponse.json(
        { error: "Professor não encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        userId: professor.id,
        ...(contractedTrainingDaysPerMonth !== undefined && {
          contractedTrainingDaysPerMonth,
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        active: true,
        contractedTrainingDaysPerMonth: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, student: updated });
  } catch (error) {
    console.error("Erro ao vincular aluno:", error);
    return NextResponse.json({ error: "Erro ao vincular aluno" }, { status: 500 });
  }
}
