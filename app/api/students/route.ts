import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { hash } from "bcryptjs";
import { calculateAgeYears, formatBirthDateInput, validateBirthDateInput } from "@/lib/student-age";

type AnyStudent = Record<string, any>;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
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

function isProfessorUser(user?: { role?: string | null } | null): boolean {
  const role = normalizeRole(user?.role);
  return ["GESTOR", "ADMIN", "TEACHER"].includes(role);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (role !== "GESTOR" && role !== "ADMIN" && role !== "TEACHER") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const where: any = {
      active: true,
    };

    if (role === "TEACHER") {
      where.userId = userId;
    }

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        name: true,
        preferredName: true,
        email: true,
        phone: true,
        notes: true,
        image: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        commercialStatus: true,
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
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      students: students.map((student) => {
        const profile = buildInitialProfile(student);
        const professorLinked = isProfessorUser(student.user);
        const ageYears = calculateAgeYears(student.userAuth?.birthDate);

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          phone: student.phone || student.userAuth?.phone || null,
          birthDate: formatBirthDateInput(student.userAuth?.birthDate),
          ageYears,
          isMinor: ageYears !== null && ageYears < 18,
          hasBirthDate: Boolean(student.userAuth?.birthDate),
          notes: student.notes,
          image: student.image || student.userAuth?.image || null,
          active: student.active,
          createdAt: student.createdAt,
          updatedAt: student.updatedAt,
          onboardingCompleto: student.onboardingCompleto,
          contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
          commercialStatus: student.commercialStatus,

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
      }),
    });
  } catch (error: any) {
    console.error("GET /api/students error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const currentUserId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!currentUserId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (role !== "GESTOR" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Apenas gestores podem cadastrar alunos." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim() || null;
    const password = String(body?.password || "");
    const notes = String(body?.notes || "").trim() || null;
    const image = String(body?.image ?? body?.imageUrl ?? "").trim() || null;
    const active = body?.active !== false;
    const professorId = String(body?.professorId || "").trim() || null;
    const contractedTrainingDaysPerMonth =
      body?.contractedTrainingDaysPerMonth === null ||
      body?.contractedTrainingDaysPerMonth === undefined ||
      body?.contractedTrainingDaysPerMonth === ""
        ? null
        : Number(body.contractedTrainingDaysPerMonth);
    const birthDateValidation = validateBirthDateInput(body?.birthDate);

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Preencha nome, e-mail e senha inicial." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    if (birthDateValidation.error || !birthDateValidation.birthDate) {
      return NextResponse.json(
        { error: birthDateValidation.error || "Informe a data de nascimento do aluno." },
        { status: 400 }
      );
    }

    if (
      contractedTrainingDaysPerMonth !== null &&
      (!Number.isInteger(contractedTrainingDaysPerMonth) || contractedTrainingDaysPerMonth < 0)
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

    let responsibleUserId = currentUserId;

    if (professorId) {
      const professor = await prisma.user.findFirst({
        where: {
          id: professorId,
          role: { in: ["PROFESSOR", "TEACHER"] },
          active: true,
        },
        select: { id: true },
      });

      if (!professor) {
        return NextResponse.json(
          { error: "Professor responsável não encontrado." },
          { status: 404 }
        );
      }

      responsibleUserId = professor.id;
    }

    const passwordHash = await hash(password, 12);

    const created = await prisma.$transaction(async (tx) => {
      const authUser = await tx.user.create({
        data: {
          name,
          email,
          phone,
          birthDate: birthDateValidation.birthDate,
          image,
          password: passwordHash,
          role: "ALUNO",
          active,
        },
      });

      return tx.student.create({
        data: {
          userId: responsibleUserId,
          userAuthId: authUser.id,
          name,
          email,
          phone,
          notes,
          image,
          active,
          onboardingCompleto: false,
          contractedTrainingDaysPerMonth,
          commercialStatus: "SEM_CONTRATO_ATIVO",
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          notes: true,
          image: true,
          active: true,
          userId: true,
          userAuthId: true,
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
    });

    const ageYears = calculateAgeYears(created.userAuth?.birthDate);

    return NextResponse.json(
      {
        student: {
          ...created,
          birthDate: formatBirthDateInput(created.userAuth?.birthDate),
          ageYears,
          isMinor: ageYears !== null && ageYears < 18,
          hasBirthDate: Boolean(created.userAuth?.birthDate),
          professorId: isProfessorUser(created.user) ? created.user?.id || null : null,
          professorName: isProfessorUser(created.user)
            ? created.user?.name || "Não vinculado"
            : "Não vinculado",
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/students error:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um cadastro com estes dados." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao cadastrar aluno.", message: error?.message },
      { status: 500 }
    );
  }
}

