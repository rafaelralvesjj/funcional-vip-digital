import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { calculateAgeYears, formatBirthDateInput } from "@/lib/student-age";

const TEACHER_ROLES = new Set(["PROFESSOR", "TEACHER"]);
const TERMINAL_CONTRACT_STATUSES = new Set([
  "CANCELADO",
  "CANCELLED",
  "FINALIZADO",
  "FINALIZED",
  "INATIVO",
  "ENCERRADO",
]);

function normalizeRole(role?: string | null): string {
  const value = String(role || "").trim().toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function isTeacherRole(role?: string | null): boolean {
  return TEACHER_ROLES.has(String(role || "").trim().toUpperCase());
}

function isUsableContractStatus(status?: string | null): boolean {
  return !TERMINAL_CONTRACT_STATUSES.has(String(status || "").trim().toUpperCase());
}

function toTimestamp(value?: Date | string | null): number {
  if (!value) return 0;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function contractPriority(contract: {
  status: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}): number {
  const now = Date.now();
  const start = toTimestamp(contract.startDate);
  const end = toTimestamp(contract.endDate);
  const status = String(contract.status || "").toUpperCase();

  let score = 0;

  if (start <= now && end >= now) score += 1_000_000;
  if (status === "ACTIVE" || status === "ATIVO") score += 500_000;
  if (start <= now) score += 100_000;

  score += Math.floor(start / 1_000_000_000);
  score += Math.floor(toTimestamp(contract.createdAt) / 10_000_000_000);

  return score;
}

type ProfessorCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
};

type StudentWithProfessor = {
  user: ProfessorCandidate | null;
  contracts: Array<{
    status: string;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
    professor: ProfessorCandidate | null;
  }>;
};

function resolveProfessorFromStudent(student: StudentWithProfessor) {
  const contractProfessor = (student.contracts || [])
    .filter(
      (contract) =>
        isUsableContractStatus(contract.status) &&
        contract.professor?.active !== false &&
        isTeacherRole(contract.professor?.role)
    )
    .sort((a, b) => contractPriority(b) - contractPriority(a))[0]?.professor;

  if (contractProfessor) return contractProfessor;

  if (student.user?.active !== false && isTeacherRole(student.user?.role)) {
    return student.user;
  }

  return null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const role = normalizeRole(sessionUser?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!new Set(["GESTOR", "ADMIN", "TEACHER"]).has(role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const students = await prisma.student.findMany({
      where: {
        active: true,
        ...(role === "TEACHER"
          ? {
              OR: [
                { userId },
                {
                  contracts: {
                    some: {
                      professorId: userId,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        contractedTrainingDaysPerMonth: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
        userAuth: {
          select: {
            birthDate: true,
          },
        },
        contracts: {
          where: {
            professorId: {
              not: null,
            },
          },
          select: {
            status: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            professor: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const responseStudents = students
      .map((student) => {
        const professor = resolveProfessorFromStudent(student);

        if (role === "TEACHER" && professor?.id !== userId) {
          return null;
        }

        const birthDate = student.userAuth?.birthDate || null;
        const ageYears = calculateAgeYears(birthDate);

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          professorName: professor?.name || null,
          contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
          birthDate: formatBirthDateInput(birthDate),
          ageYears,
          isMinor: ageYears !== null && ageYears < 18,
          hasBirthDate: Boolean(birthDate),
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      {
        students: responseStudents,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/students/ai-summary error:", error);

    return NextResponse.json(
      {
        error: "Erro ao carregar alunos para o resumo IA.",
        message: error?.message || null,
      },
      { status: 500 }
    );
  }
}
