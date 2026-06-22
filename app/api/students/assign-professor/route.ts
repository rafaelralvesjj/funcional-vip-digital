import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function PUT(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!user || user.role !== "GESTOR") {
      return NextResponse.json({ error: "Apenas gestores podem vincular alunos" }, { status: 403 });
    }

    const { studentId, professorId } = await request.json();

    if (!studentId || !professorId) {
      return NextResponse.json({ error: "studentId e professorId são obrigatórios" }, { status: 400 });
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { userId: professorId },
    });

    return NextResponse.json({ success: true, student: updated });
  } catch (error) {
    console.error("Erro ao vincular aluno:", error);
    return NextResponse.json({ error: "Erro ao vincular aluno" }, { status: 500 });
  }
}
