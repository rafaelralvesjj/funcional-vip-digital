import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { calculateAgeYears, formatBirthDateInput, validateBirthDateInput } from "@/lib/student-age";

type AnyStudent = Record<string, any>;

function normalizeRole(role?: string | null) {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
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

function cleanExtractedValue(value?: string | null): string | null {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .trim();

  return text || null;
}

function removeUnit(value: string | null, unitRegex: RegExp): string | null {
  if (!value) return null;

  const cleaned = value.replace(unitRegex, "").trim();
  return cleaned || value;
}

function extractFromNotes(notes: string | null | undefined, labels: string[]): string | null {
  const lines = String(notes || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);

  for (const label of labels) {
    const prefix = `${label.toLowerCase()}:`;
    const line = lines.find((item) => item.toLowerCase().startsWith(prefix));

    if (line) {
      return cleanExtractedValue(line.slice(label.length + 1));
    }
  }

  return null;
}

function buildInitialProfile(student: AnyStudent) {
  const notes = String(student?.notes || "");

  const timeAvailableMinutes = removeUnit(
    extractFromNotes(notes, [
      "Tempo disponível por treino",
      "Tempo disponivel por treino",
    ]),
    /\s*minuto\(s\)$/i
  );

  const weightKg = removeUnit(
    extractFromNotes(notes, ["Peso informado"]),
    /\s*kg$/i
  );

  const heightCm = removeUnit(
    extractFromNotes(notes, ["Altura informada"]),
    /\s*cm$/i
  );

  return {
    objective: extractFromNotes(notes, [
      "Objetivo principal",
      "Objetivo",
    ]),
    activityLevel: extractFromNotes(notes, [
      "Nível atual informado",
      "Nivel atual informado",
      "Nível atual",
      "Nivel atual",
    ]),
    trainingEnvironment: extractFromNotes(notes, [
      "Ambiente de treino",
      "Local de treino",
    ]),
    availableEquipment: extractFromNotes(notes, [
      "Equipamentos/materiais disponíveis",
      "Equipamentos/materiais disponiveis",
      "Equipamentos disponíveis",
      "Equipamentos disponiveis",
      "Materiais disponíveis",
      "Materiais disponiveis",
    ]),
    timeAvailableMinutes,
    preferredDays: extractFromNotes(notes, [
      "Dias/horários preferidos",
      "Dias/horarios preferidos",
      "Dias preferidos",
    ]),
    currentPain: extractFromNotes(notes, [
      "Dor/desconforto atual informado",
      "Dor/desconforto atual",
      "Dor atual",
    ]),
    medicalRestriction: extractFromNotes(notes, [
      "Restrição médica/física declarada",
      "Restricao medica/fisica declarada",
      "Restrição médica/física",
      "Restricao medica/fisica",
      "Restrição médica",
      "Restricao medica",
    ]),
    trainingHistory: extractFromNotes(notes, [
      "Histórico de treino",
      "Historico de treino",
    ]),
    weightKg,
    heightCm,
    notes: extractFromNotes(notes, [
      "Observações livres do aluno",
      "Observacoes livres do aluno",
      "Observações do aluno",
      "Observacoes do aluno",
    ]),
  };
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

function canReadStudents(role: string) {
  return role === "GESTOR" || role === "ADMIN" || role === "TEACHER" || role === "PROFESSOR";
}

function isProfessorUser(user?: { role?: string | null } | null): boolean {
  const role = normalizeRole(user?.role);
  return ["GESTOR", "ADMIN", "TEACHER"].includes(role);
}

function buildStudentResponse(student: AnyStudent) {
  const profile = buildInitialProfile(student);
  const professorLinked = isProfessorUser(student.user);
  const ageYears = calculateAgeYears(student.userAuth?.birthDate);

  return {
    id: student.id,
    name: student.name,
    preferredName: student.preferredName,
    email: student.email,
    phone: student.phone || student.userAuth?.phone || null,
    birthDate: formatBirthDateInput(student.userAuth?.birthDate),
    ageYears,
    isMinor: ageYears !== null && ageYears < 18,
    hasBirthDate: Boolean(student.userAuth?.birthDate),
    notes: student.notes,
    image: student.image || student.userAuth?.image || null,
    active: student.active,
    onboardingCompleto: student.onboardingCompleto,
    contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
    commercialStatus: student.commercialStatus,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    userId: student.userId,
    userAuthId: student.userAuthId,

    objective: profile.objective,
    activityLevel: profile.activityLevel,
    trainingEnvironment: profile.trainingEnvironment,
    availableEquipment: profile.availableEquipment,
    timeAvailableMinutes: profile.timeAvailableMinutes,
    preferredDays: profile.preferredDays,
    currentPain: profile.currentPain,
    medicalRestriction: profile.medicalRestriction,
    trainingHistory: profile.trainingHistory,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    initialNotes: profile.notes,
    initialProfile: profile,
    profile,
    onboarding: profile,

    professorId: professorLinked ? student.user?.id || null : null,
    professorName: professorLinked ? student.user?.name || "Não vinculado" : "Não vinculado",
    professorEmail: professorLinked ? student.user?.email || null : null,
    user: student.user,
    userAuth: student.userAuth,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = normalizeRole(currentUser.role);

  if (!canReadStudents(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const { id } = params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        userAuthId: true,
        name: true,
        preferredName: true,
        email: true,
        phone: true,
        notes: true,
        image: true,
        active: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        commercialStatus: true,
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
            image: true,
            birthDate: true,
            role: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    if (role === "TEACHER" && student.userId !== currentUser.id) {
      return NextResponse.json(
        { error: "Você não tem acesso a este aluno." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      student: buildStudentResponse(student),
    });
  } catch (error: any) {
    console.error("GET /api/students/[id] error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
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
    const birthDateValidation =
      body.birthDate !== undefined
        ? validateBirthDateInput(body.birthDate)
        : null;

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

    if (birthDateValidation?.error || (birthDateValidation && !birthDateValidation.birthDate)) {
      return NextResponse.json(
        { error: birthDateValidation?.error || "Informe a data de nascimento do aluno." },
        { status: 400 }
      );
    }

    if (birthDateValidation && !existingStudent.userAuthId) {
      return NextResponse.json(
        { error: "Este aluno não possui usuário de acesso para registrar a data de nascimento." },
        { status: 409 }
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
          commercialStatus: true,
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
              birthDate: true,
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
          ...(image !== undefined && { image }),
          ...(birthDateValidation?.birthDate && {
            birthDate: birthDateValidation.birthDate,
          }),
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

    const refreshed = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        userAuthId: true,
        name: true,
        preferredName: true,
        email: true,
        phone: true,
        notes: true,
        image: true,
        active: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        commercialStatus: true,
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
            image: true,
            birthDate: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(buildStudentResponse(refreshed || updated));
  } catch (error) {
    console.error("Erro ao atualizar aluno:", error);
    return NextResponse.json({ error: "Erro ao atualizar aluno" }, { status: 500 });
  }
}
