import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";

function normalizeRole(role?: string | null) {
  return String(role || "").toUpperCase();
}

function normalizeEmail(email?: string | null) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
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

function canManageStudents(role: string) {
  return role === "GESTOR" || role === "ADMIN";
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (!canManageStudents(role)) {
    return NextResponse.json(
      { error: "Apenas gestores podem excluir alunos." },
      { status: 403 }
    );
  }

  try {
    const { id } = params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        userAuthId: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.delete({
        where: { id },
      });

      if (student.userAuthId) {
        await tx.question.updateMany({
          where: { answeredById: student.userAuthId },
          data: { answeredById: null },
        });

        await tx.notice.deleteMany({
          where: { authorId: student.userAuthId },
        });

        await tx.user.delete({
          where: { id: student.userAuthId },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir aluno:", error);
    return NextResponse.json({ error: "Erro ao excluir aluno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (!canManageStudents(role)) {
    return NextResponse.json(
      { error: "Apenas gestores podem editar alunos." },
      { status: 403 }
    );
  }

  try {
    const { id } = params;
    const body = await req.json();

    const existingStudent = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        userAuthId: true,
        userId: true,
      },
    });

    if (!existingStudent) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    const name =
      body.name !== undefined ? String(body.name || "").trim() : undefined;
    const email =
      body.email !== undefined ? normalizeEmail(body.email) : undefined;
    const phone =
      body.phone !== undefined ? String(body.phone || "").trim() || null : undefined;
    const notes =
      body.notes !== undefined ? String(body.notes || "").trim() || null : undefined;
    const image =
      body.image !== undefined || body.imageUrl !== undefined
        ? String(body.image ?? body.imageUrl ?? "").trim() || null
        : undefined;
    const active =
      body.active !== undefined ? Boolean(body.active) : undefined;
    const password =
      body.password !== undefined ? String(body.password || "") : undefined;

    const professorIdRaw =
      body.professorId !== undefined || body.userId !== undefined
        ? String(body.professorId ?? body.userId ?? "").trim()
        : undefined;

    const contractedTrainingDaysPerMonth = parseOptionalInt(
      body.contractedTrainingDaysPerMonth ?? body.trainingDaysPerMonth ?? body.daysPerMonth
    );

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }

    if (email !== undefined && !email) {
      return NextResponse.json({ error: "O e-mail é obrigatório." }, { status: 400 });
    }

    if (password !== undefined && password && password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    if (
      body.contractedTrainingDaysPerMonth !== undefined &&
      contractedTrainingDaysPerMonth === undefined
    ) {
      return NextResponse.json(
        { error: "Informe uma quantidade válida de dias contratados por mês." },
        { status: 400 }
      );
    }

    if (email && existingStudent.userAuthId) {
      const duplicatedUser = await prisma.user.findFirst({
        where: {
          email,
          id: { not: existingStudent.userAuthId },
        },
        select: { id: true },
      });

      if (duplicatedUser) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado em outro usuário." },
          { status: 409 }
        );
      }
    }

    let professorIdToSave: string | undefined;

    if (professorIdRaw !== undefined) {
      if (!professorIdRaw) {
        professorIdToSave = currentUser.id;
      } else {
        const professor = await prisma.user.findFirst({
          where: {
            id: professorIdRaw,
            role: { in: ["PROFESSOR", "TEACHER"] },
          },
          select: { id: true },
        });

        if (!professor) {
          return NextResponse.json(
            { error: "Professor responsável não encontrado." },
            { status: 404 }
          );
        }

        professorIdToSave = professor.id;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(notes !== undefined && { notes }),
          ...(image !== undefined && { image }),
          ...(active !== undefined && { active }),
          ...(professorIdToSave !== undefined && { userId: professorIdToSave }),
          ...(contractedTrainingDaysPerMonth !== undefined && {
            contractedTrainingDaysPerMonth,
          }),
        },
        select: {
          id: true,
          userId: true,
          userAuthId: true,
          name: true,
          email: true,
          phone: true,
          notes: true,
          image: true,
          active: true,
          onboardingCompleto: true,
          contractedTrainingDaysPerMonth: true,
          createdAt: true,
          updatedAt: true,
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
              phone: true,
              role: true,
            },
          },
        },
      });

      if (existingStudent.userAuthId) {
        const userAuthData: any = {
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
        };

        if (password) {
          userAuthData.password = await hash(password, 12);
        }

        if (Object.keys(userAuthData).length > 0) {
          await tx.user.update({
            where: { id: existingStudent.userAuthId },
            data: userAuthData,
          });
        }
      }

      return student;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar aluno:", error);
    return NextResponse.json({ error: "Erro ao atualizar aluno" }, { status: 500 });
  }
}
