import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
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
      return NextResponse.json({ error: "Apenas gestores podem excluir alunos" }, { status: 403 });
    }

    // Pega o ID do aluno pela URL: /api/students/delete?id=xxx
    const url = new URL(request.url);
    const studentId = url.searchParams.get("id");

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    await prisma.student.delete({
      where: { id: studentId },
    });

    return NextResponse.json({ success: true, message: "Aluno excluído com sucesso" });
  } catch (error) {
    console.error("Erro ao excluir aluno:", error);
    return NextResponse.json({ error: "Erro ao excluir aluno" }, { status: 500 });
  }
}
