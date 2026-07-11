import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { calculateAgeYears, formatBirthDateInput } from "@/lib/student-age";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
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
        active: true,
        createdAt: true,
        onboardingCompleto: true,
        contractedTrainingDaysPerMonth: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        userAuth: {
          select: {
            id: true,
            birthDate: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      students: students.map((student) => {
        const ageYears = calculateAgeYears(student.userAuth?.birthDate);

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          active: student.active,
          createdAt: student.createdAt,
          onboardingCompleto: student.onboardingCompleto,
          contractedTrainingDaysPerMonth: student.contractedTrainingDaysPerMonth,
          birthDate: formatBirthDateInput(student.userAuth?.birthDate),
          ageYears,
          isMinor: ageYears !== null && ageYears < 18,
          hasBirthDate: Boolean(student.userAuth?.birthDate),
          professorId: student.user?.id || null,
          professorName: student.user?.name || "Não vinculado",
          professorEmail: student.user?.email || null,
        };
      }),
    });
  } catch (error: any) {
    console.error("GET /api/students/ai-summary error:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error?.message },
      { status: 500 }
    );
  }
}
