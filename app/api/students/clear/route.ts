import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });

    if (!user || user.role !== "GESTOR") {
      return NextResponse.json({ error: "Apenas gestores podem limpar alunos" }, { status: 403 });
    }

    // Deleta TODOS os alunos (cascade deleta treinos, check-ins, etc)
    const result = await prisma.student.deleteMany();

    return NextResponse.json({
      success: true,
      message: `${result.count} aluno(s) removido(s)`,
      count: result.count,
    });
  } catch (error) {
    console.error("Erro ao limpar alunos:", error);
    return NextResponse.json({ error: "Erro ao limpar alunos" }, { status: 500 });
  }
}
