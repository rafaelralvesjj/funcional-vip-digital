import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeWorkoutMethodMode,
  isEligibleForCombinedWorkoutInvite,
  resolveWorkoutMethodModeChange,
  InvalidWorkoutMethodModeError,
  CombinedWorkoutInviteNotEligibleError,
  type WorkoutMethodMode,
} from "@/lib/workout-method-mode";

export const dynamic = "force-dynamic";

// Mesmos status usados em todo o app para "o aluno fez esse treino" (ver
// lib/student-dashboard-summary.ts) — janela de 30 dias do convite ao
// combinado nunca conta cadastro, contrato, WorkoutPlan criado ou semana
// liberada como início.
const COMPLETED_WORKOUT_STATUSES = ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"];

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function buildStudentWhere(userId?: string | null, email?: string | null) {
  const orWhere: any[] = [];
  const normalizedEmail = normalizeEmail(email);

  if (userId) {
    orWhere.push({ userAuthId: userId });
    orWhere.push({ userId });
  }

  if (normalizedEmail) {
    orWhere.push({ email: { equals: normalizedEmail, mode: "insensitive" } });
    orWhere.push({ userAuth: { email: { equals: normalizedEmail, mode: "insensitive" } } });
  }

  return orWhere;
}

/**
 * Troca de modo de treino (NORMAL/COMBINADO) a pedido do próprio aluno.
 * Elegibilidade e regras de transição são sempre recalculadas aqui a partir
 * do banco — nunca confiadas ao cliente. Esta rota nunca lê, cria ou altera
 * WorkoutPlan/Workout/Exercise: a mudança afeta só as próximas
 * programações, decididas depois por lib/workout-generation-strategy.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const requestedModeRaw = body?.requestedMode;
    if (requestedModeRaw !== "NORMAL" && requestedModeRaw !== "COMBINADO") {
      return NextResponse.json(
        { ok: false, error: 'Informe requestedMode como "NORMAL" ou "COMBINADO".' },
        { status: 400 }
      );
    }
    const requestedMode = requestedModeRaw as WorkoutMethodMode;

    const orWhere = buildStudentWhere(sessionUser.id, sessionUser.email);

    if (!orWhere.length) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem identificação suficiente." },
        { status: 400 }
      );
    }

    const student = await prisma.student.findFirst({
      where: { active: true, OR: orWhere },
      select: {
        id: true,
        workoutMethodMode: true,
        workouts: {
          where: { status: { in: COMPLETED_WORKOUT_STATUSES } },
          orderBy: { date: "asc" },
          take: 1,
          select: { date: true },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Aluno não encontrado para o usuário autenticado." },
        { status: 404 }
      );
    }

    const currentMode = normalizeWorkoutMethodMode(student.workoutMethodMode);
    const firstCompletedWorkoutDate = student.workouts?.[0]?.date
      ? new Date(student.workouts[0].date)
      : null;

    const isEligibleForCombined = isEligibleForCombinedWorkoutInvite({ firstCompletedWorkoutDate });

    let change;
    try {
      change = resolveWorkoutMethodModeChange({
        currentMode,
        requestedMode,
        isEligibleForCombined,
      });
    } catch (error) {
      if (error instanceof CombinedWorkoutInviteNotEligibleError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
      }
      if (error instanceof InvalidWorkoutMethodModeError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
      throw error;
    }

    if (!change) {
      return NextResponse.json({ ok: true, changed: false, workoutMethodMode: currentMode });
    }

    const now = new Date();
    const actorUserId = sessionUser.id || null;

    await prisma.$transaction([
      prisma.student.update({
        where: { id: student.id },
        data: {
          workoutMethodMode: change.newMode,
          workoutMethodModeChangedAt: now,
        },
      }),
      prisma.studentWorkoutMethodChange.create({
        data: {
          studentId: student.id,
          previousMode: change.previousMode,
          newMode: change.newMode,
          source: "STUDENT_SELF_SERVICE",
          actorUserId,
          changedAt: now,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, changed: true, workoutMethodMode: change.newMode });
  } catch (error: any) {
    console.error("Erro ao alterar modo de treino do aluno", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao alterar modo de treino do aluno.",
        message: error?.message || null,
      },
      { status: 500 }
    );
  }
}
