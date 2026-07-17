import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();
  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";
  return role;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function getPermissions(role: string) {
  const canManagePreferences = role === "TEACHER";

  return {
    role,
    canManagePreferences,
    readOnly: !canManagePreferences,
    label: canManagePreferences
      ? "Você pode tratar as preferências dos seus alunos. A conversa e a central usam o mesmo registro."
      : "A gestão acompanha todas as preferências em modo leitura. O professor responsável faz o tratamento.",
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!["TEACHER", "GESTOR", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const statusParam = String(request.nextUrl.searchParams.get("status") || "TODOS").toUpperCase();
    const actionParam = String(request.nextUrl.searchParams.get("action") || "TODAS").toUpperCase();
    const studentIdParam = cleanId(request.nextUrl.searchParams.get("studentId"));

    const where: any = {};

    if (statusParam !== "TODOS") {
      where.status = statusParam;
    }

    if (actionParam !== "TODAS") {
      where.currentWeekAction = actionParam;
    }

    if (studentIdParam) {
      where.studentId = studentIdParam;
    }

    if (role === "TEACHER") {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { professorId: userId },
            { student: { userId } },
          ],
        },
      ];
    }

    const preferences = await prisma.studentTrainingPreference.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            userAuth: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: [
        { createdAt: "desc" },
      ],
      take: 250,
    });

    const workoutIds = Array.from(
      new Set(preferences.map((item) => item.relatedWorkoutId).filter(Boolean) as string[])
    );
    const userIds = Array.from(
      new Set(
        preferences
          .flatMap((item) => [item.professorId, item.handledById])
          .filter(Boolean) as string[]
      )
    );

    const [workouts, users] = await Promise.all([
      workoutIds.length
        ? prisma.workout.findMany({
            where: { id: { in: workoutIds } },
            select: {
              id: true,
              date: true,
              status: true,
              workoutPlanId: true,
              workoutPlan: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const workoutById = new Map<string, any>(
      (workouts as any[]).map((workout) => [workout.id, workout])
    );
    const userById = new Map<string, any>(
      (users as any[]).map((item) => [item.id, item])
    );

    const normalized = preferences.map((preference) => {
      const workout = preference.relatedWorkoutId
        ? workoutById.get(preference.relatedWorkoutId) || null
        : null;
      const professor = preference.professorId
        ? userById.get(preference.professorId) || preference.student.user || null
        : preference.student.user || null;
      const handledBy = preference.handledById
        ? userById.get(preference.handledById) || null
        : null;

      return {
        id: preference.id,
        studentId: preference.studentId,
        studentName: preference.student.name,
        studentEmail: preference.student.email || preference.student.userAuth?.email || null,
        studentImage: preference.student.image || null,
        professorId: preference.professorId || preference.student.userId || null,
        professorName: professor?.name || null,
        sourceConversationId: preference.sourceConversationId,
        sourceQuestionId: preference.sourceQuestionId,
        source: preference.source || "CHAT",
        category: preference.category,
        summary: preference.summary,
        originalMessage: preference.originalMessage,
        status: preference.status,
        currentWeekAction: preference.currentWeekAction,
        relatedWorkoutId: preference.relatedWorkoutId,
        relatedWorkoutPlanId: preference.relatedWorkoutPlanId,
        relatedWorkout: workout
          ? {
              id: workout.id,
              date: workout.date.toISOString(),
              status: workout.status,
              workoutPlanId: workout.workoutPlanId || null,
              workoutPlanName: workout.workoutPlan?.name || null,
            }
          : null,
        handledAt: preference.handledAt?.toISOString() || null,
        handledById: preference.handledById,
        handledByName: handledBy?.name || null,
        createdAt: preference.createdAt.toISOString(),
        updatedAt: preference.updatedAt.toISOString(),
      };
    });

    const pendingCount = normalized.filter(
      (item) => item.status === "ACTIVE" && item.currentWeekAction === "PENDING"
    ).length;

    return NextResponse.json({
      preferences: normalized,
      counters: {
        total: normalized.length,
        pending: pendingCount,
        active: normalized.filter((item) => item.status === "ACTIVE").length,
        adapted: normalized.filter((item) => item.currentWeekAction === "ADAPTED").length,
        futureOnly: normalized.filter((item) =>
          ["FUTURE_ONLY", "NOT_APPLICABLE"].includes(item.currentWeekAction)
        ).length,
      },
      permissions: getPermissions(role),
    });
  } catch (error: any) {
    console.error("GET /api/student-training-preferences error:", error);
    return NextResponse.json(
      {
        error: "Erro ao buscar preferências de treino.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (role !== "TEACHER") {
      return NextResponse.json(
        { error: "Somente o professor responsável pode descartar uma classificação." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const id = cleanId(body?.id);
    const action = String(body?.action || "").toUpperCase();

    if (!id || action !== "DISMISS") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const preference = await prisma.studentTrainingPreference.findUnique({
      where: { id },
      include: {
        student: {
          select: { userId: true },
        },
      },
    });

    if (!preference) {
      return NextResponse.json({ error: "Preferência não encontrada." }, { status: 404 });
    }

    const canManage =
      preference.professorId === userId || preference.student.userId === userId;

    if (!canManage) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    if (preference.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Esta preferência já não está ativa." },
        { status: 409 }
      );
    }

    const updated = await prisma.studentTrainingPreference.update({
      where: { id },
      data: {
        status: "DISCARDED",
        currentWeekAction: "DISCARDED",
        handledAt: new Date(),
        handledById: userId,
      },
    });

    return NextResponse.json({
      success: true,
      preference: {
        id: updated.id,
        status: updated.status,
        currentWeekAction: updated.currentWeekAction,
      },
      message: "Classificação descartada. Ela saiu das preferências ativas, mas permanece no histórico.",
    });
  } catch (error: any) {
    console.error("PATCH /api/student-training-preferences error:", error);
    return NextResponse.json(
      {
        error: "Erro ao descartar preferência.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
