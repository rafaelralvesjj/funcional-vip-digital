import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH /api/student/[id]/onboarding
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const student = await prisma.student.update({
      where: { id: params.id },
      data: { onboardingCompleto: true },
      select: { id: true, name: true, onboardingCompleto: true },
    });

    return NextResponse.json(student);
  } catch (error) {
    console.error("Erro ao completar onboarding:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
