import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { notifyStudentAboutChatReply } from "@/lib/chat-communications";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();
  if (role === "PROFESSOR") return "TEACHER";
  return role;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const role = normalizeRole(user?.role);

    if (!user?.id || !["TEACHER", "GESTOR", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const answer = String(body?.answer || body?.content || "").trim();
    if (!answer) return NextResponse.json({ error: "Resposta é obrigatória" }, { status: 400 });

    const original = await prisma.question.findUnique({
      where: { id: params.id },
      select: { id: true, parentId: true, studentId: true, teacherId: true, resolvedAt: true },
    });
    if (!original) return NextResponse.json({ error: "Dúvida não encontrada" }, { status: 404 });

    const rootId = original.parentId || original.id;
    const root = original.parentId
      ? await prisma.question.findUnique({
          where: { id: rootId },
          select: { id: true, studentId: true, teacherId: true, resolvedAt: true },
        })
      : original;

    if (!root || !root.studentId) return NextResponse.json({ error: "Conversa sem aluno" }, { status: 400 });
    if (root.resolvedAt) return NextResponse.json({ error: "Conversa encerrada" }, { status: 400 });
    if (role === "TEACHER" && root.teacherId && root.teacherId !== user.id) {
      return NextResponse.json({ error: "Conversa direcionada a outro professor" }, { status: 403 });
    }

    const reply = await prisma.question.create({
      data: {
        content: answer,
        answer,
        answeredAt: new Date(),
        answeredById: String(user.id),
        parentId: root.id,
        studentId: root.studentId,
        teacherId: role === "TEACHER" ? String(user.id) : root.teacherId,
        senderRole: role === "TEACHER" ? "TEACHER" : "GESTOR",
      },
    });

    const senderName = String(user?.name || "").trim() || (role === "TEACHER" ? "Seu professor" : "Equipe Funcional UP Digital");
    await notifyStudentAboutChatReply({
      studentId: root.studentId,
      authorId: String(user.id),
      senderName,
      conversationId: root.id,
      replyText: answer,
    });

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error("PUT /api/questions/[id]/answer error:", error);
    return NextResponse.json({ error: "Erro ao responder dúvida" }, { status: 500 });
  }
}
