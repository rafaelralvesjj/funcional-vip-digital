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
import {
  isStudentSelfServiceRole,
  resolveStudentSelfService,
  AmbiguousStudentSelfServiceMatchError,
} from "@/lib/workout-method-mode-access";

export const dynamic = "force-dynamic";

// Mesmos status usados em todo o app para "o aluno fez esse treino" (ver
// lib/student-dashboard-summary.ts) — janela de 30 dias do convite ao
// combinado usa o instante REAL de conclusão (Workout.completedAt), nunca a
// data planejada (Workout.date), cadastro, contrato, WorkoutPlan criado ou
// semana liberada.
const COMPLETED_WORKOUT_STATUSES = ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"];

/**
 * Troca de modo de treino (NORMAL/COMBINADO) a pedido do próprio aluno.
 * Exclusiva de quem está autenticado como o próprio aluno — REVISÃO (PR #13,
 * item 1): nunca usa Student.userId para localizar o aluno-alvo (esse campo
 * é o professor responsável em vários fluxos do projeto; usá-lo aqui
 * deixaria um professor autenticado alterar qualquer aluno vinculado a
 * ele). Elegibilidade e regras de transição são sempre recalculadas aqui a
 * partir do banco — nunca confiadas ao cliente. Esta rota nunca lê, cria ou
 * altera WorkoutPlan/Workout/Exercise: a mudança afeta só as próximas
 * programações, decididas depois por lib/workout-generation-strategy.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as
      | { id?: string; email?: string | null; role?: string | null }
      | undefined;

    if (!sessionUser?.id && !sessionUser?.email) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    if (!isStudentSelfServiceRole(sessionUser?.role)) {
      return NextResponse.json(
        { ok: false, error: "Esta ação é exclusiva do próprio aluno." },
        { status: 403 }
      );
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

    const studentSelect = {
      id: true,
      workoutMethodMode: true,
      workouts: {
        where: {
          status: { in: COMPLETED_WORKOUT_STATUSES },
          completedAt: { not: null },
        },
        orderBy: { completedAt: "asc" as const },
        take: 1,
        select: { completedAt: true },
      },
    } as const;

    let student;
    try {
      student = await resolveStudentSelfService({
        sessionUserId: sessionUser?.id || null,
        sessionEmail: sessionUser?.email || null,
        // Etapa 1: userAuthId é @unique no schema — no máximo um resultado.
        findByUserAuthId: (userAuthId) =>
          prisma.student.findFirst({
            where: { active: true, userAuthId },
            select: studentSelect,
          }),
        // Etapa 2 (só se a etapa 1 não encontrou nada): compatibilidade
        // legada só para aluno ainda sem login vinculado (userAuthId null).
        // Student.email não é unique — devolve TODOS os candidatos para que
        // resolveStudentSelfService rejeite ambiguidade em vez de escolher
        // um arbitrariamente.
        findLegacyCandidatesByEmail: (normalizedEmail) =>
          prisma.student.findMany({
            where: {
              active: true,
              userAuthId: null,
              email: { equals: normalizedEmail, mode: "insensitive" },
            },
            select: studentSelect,
          }),
      });
    } catch (error) {
      if (error instanceof AmbiguousStudentSelfServiceMatchError) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Não foi possível identificar seu cadastro com segurança (mais de um aluno legado com o mesmo e-mail). Fale com a equipe.",
          },
          { status: 409 }
        );
      }
      throw error;
    }

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Aluno não encontrado para o usuário autenticado." },
        { status: 404 }
      );
    }

    const currentMode = normalizeWorkoutMethodMode(student.workoutMethodMode);
    const firstCompletedWorkoutDate = student.workouts?.[0]?.completedAt
      ? new Date(student.workouts[0].completedAt)
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
    const actorUserId = sessionUser?.id || null;

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
