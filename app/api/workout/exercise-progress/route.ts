import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeDay(value: string | Date): Date {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

async function getStudentForSession() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!session?.user || !email) return null;

  return prisma.student.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        { userAuth: { email: { equals: email, mode: "insensitive" } } },
      ],
    },
    select: { id: true },
  });
}

export async function GET(request: NextRequest) {
  const student = await getStudentForSession();
  if (!student) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

  const workoutPlanId = String(request.nextUrl.searchParams.get("workoutPlanId") || "").trim();
  const dateValue = String(request.nextUrl.searchParams.get("date") || "").trim();
  if (!workoutPlanId || !dateValue) {
    return NextResponse.json({ error: "Treino e data são obrigatórios." }, { status: 400 });
  }

  const workoutDate = normalizeDay(dateValue);
  const items = await prisma.workoutExerciseProgress.findMany({
    where: { studentId: student.id, workoutPlanId, workoutDate },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const student = await getStudentForSession();
  if (!student) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const workoutPlanId = String(body?.workoutPlanId || "").trim();
  const exerciseId = String(body?.exerciseId || "").trim();
  const status = String(body?.status || "").trim().toUpperCase();
  const effort = body?.effort ? String(body.effort).trim().toUpperCase() : null;
  const skipReason = body?.skipReason ? String(body.skipReason).trim() : null;
  const dateValue = String(body?.date || "").trim();

  if (!workoutPlanId || !exerciseId || !dateValue || !["CONCLUIDO", "PULADO", "PENDENTE"].includes(status)) {
    return NextResponse.json({ error: "Dados inválidos para registrar o exercício." }, { status: 400 });
  }
  if (status === "PULADO" && !skipReason) {
    return NextResponse.json({ error: "Informe por que o exercício não foi realizado." }, { status: 400 });
  }

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, workoutPlanId, workoutPlan: { studentId: student.id } },
    select: { id: true },
  });
  if (!exercise) return NextResponse.json({ error: "Exercício não encontrado." }, { status: 404 });

  const workoutDate = normalizeDay(dateValue);
  const item = await prisma.workoutExerciseProgress.upsert({
    where: {
      studentId_exerciseId_workoutDate: {
        studentId: student.id,
        exerciseId,
        workoutDate,
      },
    },
    create: {
      studentId: student.id,
      workoutPlanId,
      exerciseId,
      workoutDate,
      status,
      effort: status === "CONCLUIDO" ? effort : null,
      skipReason: status === "PULADO" ? skipReason : null,
      completedAt: status === "PENDENTE" ? null : new Date(),
    },
    update: {
      status,
      effort: status === "CONCLUIDO" ? effort : null,
      skipReason: status === "PULADO" ? skipReason : null,
      completedAt: status === "PENDENTE" ? null : new Date(),
    },
  });

  return NextResponse.json({ ok: true, item });
}
