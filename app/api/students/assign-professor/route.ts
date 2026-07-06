import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManage(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
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
          commercialStatus: true,
        },
      }),
      prisma.user.findUnique({
        where: {
          id: professorId,
        },
        select: {
          id: true,
          name: true,
          role: true,
          active: true,
        },
      }),
    ]);

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    if (!professor || professor.active === false) {
      return NextResponse.json({ error: "Professor não encontrado ou inativo." }, { status: 404 });
    }

    const professorRole = normalizeRole(professor.role);

    if (professorRole !== "TEACHER" && professorRole !== "GESTOR" && professorRole !== "ADMIN") {
      return NextResponse.json(
        { error: "O usuário selecionado não pode ser responsável por aluno." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedStudent = await tx.student.update({
        where: {
          id: studentId,
        },
        data: {
          userId: professorId,
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
            },
          },
        },
      });

      /*
       * Se já existir contrato ativo, também atualizamos o professor do ciclo atual.
       * Isso mantém treino, financeiro e dashboard falando a mesma língua.
       */
      await tx.studentContract.updateMany({
        where: {
          studentId,
          status: "ACTIVE",
        },
        data: {
          professorId,
        },
      });

      return updatedStudent;
    });

    return NextResponse.json({
      ok: true,
      message:
        result.commercialStatus === "CONTRATO_ATIVO" || result.commercialStatus === "EXPERIENCIA_ATIVA"
          ? "Professor vinculado ao aluno e ao contrato ativo."
          : "Professor vinculado. Para liberar treinos, crie uma experiência grátis ou contrato no Financeiro.",
      student: {
        id: result.id,
        name: result.name,
        email: result.email,
        commercialStatus: result.commercialStatus,
        contractedTrainingDaysPerMonth: result.contractedTrainingDaysPerMonth,
        professorId: result.user?.id || null,
        professorName: result.user?.name || null,
        professorEmail: result.user?.email || null,
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
