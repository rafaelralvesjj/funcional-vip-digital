import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { registerCareEventFromStudentMessage } from "@/lib/student-care-chat-events";
import { registerTrainingPreferenceFromStudentMessage } from "@/lib/student-training-preferences";
import { consolidateActiveCareEvents } from "@/lib/student-care-event-consolidation";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();

  if (role === "ALUNO") return "STUDENT";
  if (role === "PROFESSOR") return "TEACHER";

  return role;
}

function subtractDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}

async function resolveAccessibleStudentIds({
  userId,
  role,
}: {
  userId: string;
  role: string;
}): Promise<string[]> {
  if (role === "STUDENT") {
    const student = await prisma.student.findFirst({
      where: { userAuthId: userId },
      select: { id: true },
    });

    return student?.id ? [student.id] : [];
  }

  if (role === "TEACHER") {
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { userId },
          {
            contracts: {
              some: {
                professorId: userId,
                status: {
                  notIn: [
                    "CANCELADO",
                    "CANCELLED",
                    "FINALIZADO",
                    "FINALIZED",
                    "INATIVO",
                    "ENCERRADO",
                  ],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return students.map((student) => student.id);
  }

  if (role === "GESTOR" || role === "ADMIN") {
    const students = await prisma.student.findMany({
      where: { active: true },
      select: { id: true },
    });

    return students.map((student) => student.id);
  }

  return [];
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId = user?.id ? String(user.id) : null;
    const role = normalizeRole(user?.role);

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!["STUDENT", "TEACHER", "GESTOR", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedDays = Number(body?.days || 60);
    const days = Number.isFinite(requestedDays)
      ? Math.min(180, Math.max(7, Math.trunc(requestedDays)))
      : 60;
    const studentIds = await resolveAccessibleStudentIds({ userId, role });

    if (studentIds.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        careCreated: 0,
        careUpdated: 0,
        changesRecovered: 0,
      });
    }

    const messages = await prisma.question.findMany({
      where: {
        studentId: { in: studentIds },
        senderRole: { in: ["STUDENT", "ALUNO"] },
        createdAt: { gte: subtractDays(new Date(), days) },
      },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        teacherId: true,
        answeredById: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    const existingPreferences = messages.length
      ? await prisma.studentTrainingPreference.findMany({
          where: {
            sourceQuestionId: {
              in: messages.map((message) => message.id),
            },
          },
          select: {
            sourceQuestionId: true,
          },
        })
      : [];

    const existingPreferenceMessageIds = new Set(
      existingPreferences.map((preference) => preference.sourceQuestionId)
    );

    let careCreated = 0;
    let careUpdated = 0;
    let changesRecovered = 0;
    const errors: string[] = [];

    for (const message of messages) {
      if (!message.studentId) continue;

      try {
        const careResult = await registerCareEventFromStudentMessage({
          rootConversationId: message.parentId || message.id,
          messageId: message.id,
          studentId: message.studentId,
          professorId: message.teacherId,
          authorId: message.answeredById || userId,
          content: message.content,
          createdAt: message.createdAt,
          notifyProfessor: false,
        });

        if (careResult.action === "CREATED") careCreated += 1;
        if (careResult.action === "UPDATED") careUpdated += 1;
      } catch (error: any) {
        errors.push(`Cuidado ${message.id}: ${error?.message || "erro desconhecido"}`);
      }

      if (!existingPreferenceMessageIds.has(message.id)) {
        try {
          const preference = await registerTrainingPreferenceFromStudentMessage({
            sourceMessageId: message.id,
            sourceConversationId: message.parentId || message.id,
            studentId: message.studentId,
            professorId: message.teacherId,
            content: message.content,
            source: "CHAT",
            referenceDate: message.createdAt,
          });

          if (preference) {
            changesRecovered += 1;
            existingPreferenceMessageIds.add(message.id);
          }
        } catch (error: any) {
          errors.push(`Mudança ${message.id}: ${error?.message || "erro desconhecido"}`);
        }
      }
    }

    const consolidation = await consolidateActiveCareEvents({ studentIds });

    return NextResponse.json({
      success: true,
      scanned: messages.length,
      careCreated,
      careUpdated,
      changesRecovered,
      duplicatesResolved: consolidation.duplicatesResolved,
      errors: errors.slice(0, 20),
    });
  } catch (error: any) {
    console.error("POST /api/student-message-signals/recover error:", error);

    return NextResponse.json(
      {
        error: "Erro ao recuperar sinais recentes do chat.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
