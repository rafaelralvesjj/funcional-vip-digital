import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { calculateAgeYears, formatBirthDateInput } from "@/lib/student-age";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const students = await prisma.student.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        userAuthId: true,
        active: true,
        contractedTrainingDaysPerMonth: true,
        createdAt: true,
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
            birthDate: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      students.map((student) => {
        const ageYears = calculateAgeYears(student.userAuth?.birthDate);

        return {
          ...student,
          birthDate: formatBirthDateInput(student.userAuth?.birthDate),
          ageYears,
          isMinor: ageYears !== null && ageYears < 18,
          hasBirthDate: Boolean(student.userAuth?.birthDate),
        };
      })
    );
  } catch (error) {
    console.error("Erro ao buscar alunos:", error);
    return NextResponse.json(
      { error: "Erro ao buscar alunos" },
      { status: 500 }
    );
  }
}
