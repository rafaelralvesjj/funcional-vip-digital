import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, name, description, weekDay, notes, exercises = [] } = body;

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json(
        { error: "studentId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    const studentExists = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!studentExists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const normalizedExercises = exercises.map((ex: any, index: number) => ({
      name: ex.name,
      description: ex.description,
      series: ex.series,
      reps: ex.reps,
      weight: ex.weight,
      restTime: ex.restTime,
      notes: ex.notes,
      order: typeof ex.order === "number" ? ex.order : index,
      videoUrl: ex.videoUrl,
      imageUrl: ex.imageUrl,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          studentId,
          name: name.trim(),
          description: description?.trim() || null,
          weekDay: weekDay?.trim() || null,
          notes: notes?.trim() || null,
          exercises: {
            create: normalizedExercises,
          },
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });
      return plan;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const studentId = searchParams.get("studentId");

    if (id) {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (!plan) {
        return NextResponse.json(
          { error: "Workout plan not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(plan);
    }

    if (studentId) {
      const plans = await prisma.workoutPlan.findMany({
        where: { studentId },
        include: {
          exercises: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json(plans);
    }

    return NextResponse.json(
      { error: "Provide either id or studentId query parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("GET /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.exercise.deleteMany({
        where: { workoutPlanId: id },
      });

      await tx.workoutPlan.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error("DELETE /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}
