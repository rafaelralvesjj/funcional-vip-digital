import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash } from "bcryptjs";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  try {
    let where: any = {};

    if (role === "TEACHER" || role === "PROFESSOR") {
      where = { userId: currentUser.id };
    } else if (role === "GESTOR" || role === "ADMIN") {
      where = {};
    } else if (role === "ALUNO" || role === "STUDENT") {
      where = { userAuthId: currentUser.id };
    } else {
      return NextResponse.json([]);
    }

    const students = await prisma.student.findMany({
      where,
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
      orderBy: { name: "asc" },
    });

    return NextResponse.json(students);
  } catch (error) {
    console.error("Erro ao buscar alunos:", error);
    return NextResponse.json({ error: "Erro ao buscar alunos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (role !== "GESTOR" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas gestores podem cadastrar alunos por esta tela." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || "").trim() || null;
    const password = String(body.password || "");
    const notes = String(body.notes || "").trim() || null;
    const image = String(body.image || body.imageUrl || "").trim() || null;
    const active = body.active === undefined ? true : Boolean(body.active);
    const professorId = String(body.professorId || body.userId || "").trim() || null;
    const contractedTrainingDaysPerMonth = parseOptionalInt(
      body.contractedTrainingDaysPerMonth ?? body.trainingDaysPerMonth ?? body.daysPerMonth
    );

    if (!name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "O e-mail é obrigatório." }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "A senha inicial é obrigatória." }, { status: 400 });
    }

    if (password.length < 6) {
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

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado." },
        { status: 409 }
      );
    }

    let professorResponsibleId = currentUser.id;

    if (professorId) {
      const professor = await prisma.user.findFirst({
        where: {
          id: professorId,
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

      professorResponsibleId = professor.id;
    }

    const hashedPassword = await hash(password, 12);

    const created = await prisma.$transaction(async (tx) => {
      const userAuth = await tx.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
          role: "ALUNO",
        },
      });

      const student = await tx.student.create({
        data: {
          userId: professorResponsibleId,
          userAuthId: userAuth.id,
          name,
          email,
          phone,
          notes,
          image,
          active,
          contractedTrainingDaysPerMonth:
            contractedTrainingDaysPerMonth === undefined ? null : contractedTrainingDaysPerMonth,
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

      return student;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar aluno:", error);
    return NextResponse.json({ error: "Erro ao cadastrar aluno." }, { status: 500 });
  }
}
