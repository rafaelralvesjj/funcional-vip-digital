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

    const url = new URL(request.url);
    const studentId = url.searchParams.get("id");

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    // Deleta manualmente os registros relacionados antes do aluno
    await prisma.$transaction([
      prisma.notice.deleteMany({ where: { studentId } }),
      prisma.question.deleteMany({ where: { studentId } }),
      prisma.checkIn.deleteMany({ where: { studentId } }),
      prisma.weeklyFeedback.deleteMany({ where: { studentId } }),
      prisma.avaliacao.deleteMany({ where: { alunoId: studentId } }),

      // Exercícios dos planos de treino
      prisma.$executeRaw`DELETE FROM exercises WHERE workout_plan_id IN (SELECT id FROM workout_plans WHERE student_id = ${studentId})`,

      // Workouts vinculados aos planos
      prisma.$executeRaw`DELETE FROM workouts WHERE student_id = ${studentId}`,

      // Planos de treino
      prisma.workoutPlan.deleteMany({ where: { studentId } }),

      // Finalmente, o aluno
      prisma.student.delete({ where: { id: studentId } }),
    ]);

    return NextResponse.json({ success: true, message: "Aluno excluído com sucesso" });
  } catch (error) {
    console.error("Erro ao excluir aluno:", error);
    return NextResponse.json({ error: "Erro ao excluir aluno. Detalhes: " + (error instanceof Error ? error.message : "Erro desconhecido") }, { status: 500 });
  }
}
