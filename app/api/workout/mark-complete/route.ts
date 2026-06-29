import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST - Marcar treino como concluído
export async function POST(req: NextRequest) {
  try {
    const { workoutPlanId, studentId, date } = await req.json();

    if (!workoutPlanId || !studentId) {
      return NextResponse.json(
        { error: "workoutPlanId e studentId são obrigatórios" },
        { status: 400 }
      );
    }

    const workoutDate = date ? new Date(date) : new Date();
    workoutDate.setHours(0, 0, 0, 0);

    // Verifica se já existe um registro de workout para este plano + data
    const existing = await prisma.workout.findFirst({
      where: {
        studentId,
        workoutPlanId,
        date: workoutDate,
      },
    });

    if (existing) {
      if (existing.status === "COMPLETED") {
        return NextResponse.json(
          { message: "Treino já foi marcado como concluído hoje!", alreadyDone: true }
        );
      }

      const updated = await prisma.workout.update({
        where: { id: existing.id },
        data: { status: "COMPLETED" },
      });

      return NextResponse.json({ success: true, workout: updated, message: "Treino concluído com sucesso!" });
    }

    const workout = await prisma.workout.create({
      data: {
        studentId,
        workoutPlanId,
        date: workoutDate,
        status: "COMPLETED",
      },
    });

    return NextResponse.json({ success: true, workout, message: "Treino concluído com sucesso!" });
  } catch (error) {
    console.error("Erro ao marcar treino:", error);
    return NextResponse.json({ error: "Erro ao marcar treino" }, { status: 500 });
  }
}

// GET - Buscar histórico de treinos concluídos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!studentId) {
      return NextResponse.json({ error: "studentId é obrigatório" }, { status: 400 });
    }

    const where: any = { studentId };

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0);
      where.date = { gte: startDate, lte: endDate };
    }

    const workouts = await prisma.workout.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return NextResponse.json(workouts);
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}
