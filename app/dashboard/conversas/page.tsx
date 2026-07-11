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

  const [students, rootConversations] = await Promise.all([
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
  ]);

  const toConversationItem = (conversation: (typeof rootConversations)[number]) => {
    const senderRole = normalizeRole(conversation.senderRole);
    const isManagementConversation = !conversation.studentId;

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
