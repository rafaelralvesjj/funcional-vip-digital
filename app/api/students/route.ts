import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

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
        email: true,
        phone: true,
        notes: true,
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

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          phone: student.phone || student.userAuth?.phone || null,
          notes: student.notes,
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
