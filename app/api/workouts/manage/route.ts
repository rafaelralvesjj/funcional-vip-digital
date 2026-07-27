import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeRole(role?: string | null) {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

async function getAccess() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId = user?.id ? String(user.id) : null;
  const role = normalizeRole(user?.role);
  if (!userId) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!["TEACHER", "GESTOR", "ADMIN"].includes(role)) {
    return { error: NextResponse.json({ error: "Acesso negado" }, { status: 403 }) };
  }
  return { userId, role };
}

export async function GET(request: NextRequest) {
  const access = await getAccess();
  if ("error" in access) return access.error;

  const studentId = request.nextUrl.searchParams.get("studentId") || undefined;
  const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;
  const studentWhere: any = { active: true };
  if (access.role === "TEACHER") studentWhere.userId = access.userId;
  if (studentId) studentWhere.id = studentId;
  if (search) studentWhere.name = { contains: search, mode: "insensitive" };

  const students = await prisma.student.findMany({
    where: studentWhere,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      preferredName: true,
      email: true,
      workoutPlans: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          exercises: { orderBy: { order: "asc" } },
          workouts: { orderBy: { date: "desc" } },
        },
      },
    },
  });

  return NextResponse.json({ students });
}

export async function PUT(request: NextRequest) {
  const access = await getAccess();
  if ("error" in access) return access.error;

  const body = await request.json().catch(() => null);
  const workoutPlanId = String(body?.workoutPlanId || "");
  if (!workoutPlanId) return NextResponse.json({ error: "Treino não informado" }, { status: 400 });

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: workoutPlanId },
    include: { student: { select: { userId: true } }, workouts: true },
  });
  if (!plan) return NextResponse.json({ error: "Treino não encontrado" }, { status: 404 });
  if (access.role === "TEACHER" && plan.student.userId !== access.userId) {
    return NextResponse.json({ error: "Você não pode editar o treino deste aluno" }, { status: 403 });
  }
  if (plan.workouts.some((workout) => String(workout.status).toUpperCase() === "CONCLUIDO")) {
    return NextResponse.json({ error: "Treino concluído não pode ser alterado" }, { status: 409 });
  }

  const exercises = Array.isArray(body?.exercises) ? body.exercises : [];
  if (exercises.length === 0) {
    return NextResponse.json({ error: "O treino precisa ter ao menos um exercício" }, { status: 400 });
  }

  const libraryIds = exercises.map((item: any) => String(item.libraryExerciseId || item.exerciseId || "")).filter(Boolean);
  const library = await prisma.exerciseLibrary.findMany({ where: { id: { in: libraryIds } } });
  const libraryById = new Map(library.map((item) => [item.id, item]));
  if (libraryIds.some((id: string) => !libraryById.has(id))) {
    return NextResponse.json({ error: "Existe exercício fora da biblioteca oficial" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.exercise.deleteMany({ where: { workoutPlanId } });
    await tx.workoutPlan.update({
      where: { id: workoutPlanId },
      data: {
        name: String(body?.name || plan.name).trim(),
        description: body?.description ? String(body.description).trim() : null,
        objective: body?.objective ? String(body.objective).trim() : null,
        focusAreas: body?.focusAreas ? String(body.focusAreas).trim() : null,
        intensity: body?.intensity ? String(body.intensity).trim() : null,
        estimatedDurationMinutes: body?.estimatedDurationMinutes === "" || body?.estimatedDurationMinutes == null ? null : Number(body.estimatedDurationMinutes),
        estimatedCaloriesMin: body?.estimatedCaloriesMin === "" || body?.estimatedCaloriesMin == null ? null : Number(body.estimatedCaloriesMin),
        estimatedCaloriesMax: body?.estimatedCaloriesMax === "" || body?.estimatedCaloriesMax == null ? null : Number(body.estimatedCaloriesMax),
        studentSummary: body?.studentSummary ? String(body.studentSummary).trim() : null,
        safetyNote: body?.safetyNote ? String(body.safetyNote).trim() : null,
        notes: body?.notes ? String(body.notes).trim() : null,
      },
    });
    await tx.exercise.createMany({
      data: exercises.map((item: any, index: number) => {
        const libraryId = String(item.libraryExerciseId || item.exerciseId);
        const source = libraryById.get(libraryId)!;
        return {
          workoutPlanId,
          libraryExerciseId: libraryId,
          name: source.name,
          description: source.description || null,
          series: item.series === "" || item.series == null ? null : Number(item.series),
          reps: item.reps ? String(item.reps) : null,
          weight: item.weight ? String(item.weight) : null,
          restTime: item.restTime ? String(item.restTime) : null,
          notes: item.notes ? String(item.notes) : null,
          order: index,
          imageUrl: source.imageUrl || null,
          videoUrl: source.videoUrl || null,
        };
      }),
    });
    return tx.workoutPlan.findUnique({
      where: { id: workoutPlanId },
      include: { exercises: { orderBy: { order: "asc" } }, workouts: true },
    });
  });

  return NextResponse.json({ success: true, workoutPlan: updated });
}
