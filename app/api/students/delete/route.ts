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

    // Verifica se o aluno existe
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    // Deleta na ordem correta para evitar erros de constraint
    await prisma.$transaction([
      // 1. Avaliações
      prisma.avaliacao.deleteMany({ where: { alunoId: studentId } }),
      
      // 2. Exercícios dos planos de treino
      prisma.$executeRawUnsafe(`DELETE FROM exercises WHERE workout_plan_id IN (SELECT id FROM workout_plans WHERE student_id = $1)`, studentId),
      
      // 3. Workouts
      prisma.workout.deleteMany({ where: { studentId } }),
      
      // 4. Planos de treino
      prisma.workoutPlan.deleteMany({ where: { studentId } }),
      
      // 5. Check-ins
      prisma.checkIn.deleteMany({ where: { studentId } }),
      
      // 6. Feedbacks
      prisma.weeklyFeedback.deleteMany({ where: { studentId } }),
      
      // 7. Avisos
      prisma.notice.deleteMany({ where: { studentId } }),
      
      // 8. Perguntas
      prisma.question.deleteMany({ where: { studentId } }),
      
      // 9. Finalmente o aluno
      prisma.student.delete({ where: { id: studentId } }),
    ]);

    return NextResponse.json({ success: true, message: "Aluno excluído com sucesso" });
  } catch (error) {
    // Captura o erro real para diagnóstico
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro detalhado ao excluir aluno:", errorMessage);
    return NextResponse.json({ 
      error: "Erro ao excluir aluno", 
      detalhes: errorMessage 
    }, { status: 500 });
  }
}
