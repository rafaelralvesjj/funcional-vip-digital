import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import TeacherConversationCenter from "@/components/TeacherConversationCenter";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();

  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";

  return role;
}

function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

export default async function TeacherConversationsPage() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id) {
    redirect("/auth/signin");
  }

  const userId = String(sessionUser.id);
  const role = normalizeRole(sessionUser.role);

  if (role !== "TEACHER") {
    redirect("/dashboard");
  }

  const [students, rootConversations, pendingPreferences] = await Promise.all([
    prisma.student.findMany({
      where: {
        userId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.question.findMany({
      where: {
        parentId: null,
        teacherId: userId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        answeredBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        children: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            answeredBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.studentTrainingPreference.findMany({
      where: {
        professorId: userId,
        status: "ACTIVE",
        currentWeekAction: "PENDING",
      },
      select: {
        id: true,
        studentId: true,
        sourceConversationId: true,
        category: true,
        summary: true,
        originalMessage: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const { startOfWeek, endOfWeek } = getWeekRange(new Date());
  const preferenceStudentIds = Array.from(
    new Set(pendingPreferences.map((preference) => preference.studentId))
  );

  const pendingWorkouts = preferenceStudentIds.length
    ? await prisma.workout.findMany({
        where: {
          studentId: { in: preferenceStudentIds },
          status: { not: "CONCLUIDO" },
          date: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
        },
        select: {
          id: true,
          studentId: true,
          workoutPlanId: true,
          date: true,
          status: true,
          workoutPlan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          date: "asc",
        },
      })
    : [];

  const pendingWorkoutsByStudentId = new Map<string, typeof pendingWorkouts>();

  for (const workout of pendingWorkouts) {
    const current = pendingWorkoutsByStudentId.get(workout.studentId) || [];
    current.push(workout);
    pendingWorkoutsByStudentId.set(workout.studentId, current);
  }

  const preferenceByConversationId = new Map<
    string,
    (typeof pendingPreferences)[number]
  >();

  for (const preference of pendingPreferences) {
    if (!preferenceByConversationId.has(preference.sourceConversationId)) {
      preferenceByConversationId.set(preference.sourceConversationId, preference);
    }
  }

  const toConversationItem = (conversation: (typeof rootConversations)[number]) => {
    const senderRole = normalizeRole(conversation.senderRole);
    const isManagementConversation = !conversation.studentId;
    const preference = preferenceByConversationId.get(conversation.id) || null;
    const relatedPendingWorkouts = preference
      ? pendingWorkoutsByStudentId.get(preference.studentId) || []
      : [];

    return {
      id: conversation.id,
      studentId: conversation.studentId || null,
      teacherId: conversation.teacherId || userId,
      content: conversation.content,
      imageUrl: conversation.imageUrl || null,
      videoUrl: conversation.videoUrl || null,
      senderRole: conversation.senderRole || "TEACHER",
      createdAt: conversation.createdAt.toISOString(),
      resolvedAt: conversation.resolvedAt
        ? conversation.resolvedAt.toISOString()
        : null,
      answeredById: conversation.answeredById || null,
      openedById: conversation.answeredById || null,
      authorName:
        senderRole === "STUDENT"
          ? conversation.student?.name || "Aluno"
          : senderRole === "TEACHER"
            ? conversation.teacher?.name ||
              conversation.answeredBy?.name ||
              sessionUser.name ||
              "Professor"
            : conversation.answeredBy?.name || "Gestão",
      targetLabel: isManagementConversation
        ? senderRole === "TEACHER"
          ? "Gestão"
          : `Professor: ${conversation.teacher?.name || sessionUser.name || "Professor"}`
        : senderRole === "STUDENT"
          ? `Professor: ${conversation.teacher?.name || sessionUser.name || "Professor"}`
          : `Aluno: ${conversation.student?.name || "Aluno"}`,
      adjustmentRequest: preference
        ? {
            preferenceId: preference.id,
            category: preference.category,
            summary: preference.summary,
            originalMessage: preference.originalMessage,
            pendingWorkouts: relatedPendingWorkouts.map((workout) => ({
              workoutId: workout.id,
              workoutPlanId: workout.workoutPlanId || null,
              name: workout.workoutPlan?.name || "Treino pendente",
              date: workout.date.toISOString(),
              status: workout.status,
            })),
          }
        : null,
      children: (conversation.children || []).map((reply) => ({
        id: reply.id,
        studentId: reply.studentId || conversation.studentId || null,
        teacherId: reply.teacherId || conversation.teacherId || userId,
        content: reply.content,
        imageUrl: reply.imageUrl || null,
        videoUrl: reply.videoUrl || null,
        senderRole: reply.senderRole || "TEACHER",
        createdAt: reply.createdAt.toISOString(),
        resolvedAt: reply.resolvedAt ? reply.resolvedAt.toISOString() : null,
        answeredById: reply.answeredById || null,
        authorName:
          reply.answeredBy?.name ||
          reply.teacher?.name ||
          reply.student?.name ||
          "Usuário",
      })),
    };
  };

  const studentConversations = rootConversations
    .filter((conversation) => Boolean(conversation.studentId))
    .map(toConversationItem);

  const managementConversations = rootConversations
    .filter((conversation) => !conversation.studentId)
    .map(toConversationItem);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-5 text-[#f5f5f5] md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs uppercase tracking-[0.25em] text-[#D4A373]">
            Comunicação
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-[#D4A373]">
            Conversas
          </h1>

          <p className="mt-2 text-sm text-[#a1a1a1]">
            Inicie conversas com seus alunos ou com a gestão e acompanhe todo o histórico em um único lugar.
          </p>
        </header>

        <TeacherConversationCenter
          teacherId={userId}
          students={students}
          studentConversations={studentConversations}
          managementConversations={managementConversations}
        />
      </div>
    </div>
  );
}
