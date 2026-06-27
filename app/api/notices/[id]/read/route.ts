import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json({ error: "ID do aluno e obrigatorio" }, { status: 400 });
    }

    const existing = await prisma.noticeRead.findUnique({
      where: { noticeId_studentId: { noticeId: id, studentId } },
    });

    if (existing) {
      return NextResponse.json({ success: true, alreadyRead: true });
    }

    await prisma.noticeRead.create({
      data: { noticeId: id, studentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao marcar aviso como lido:", error);
    return NextResponse.json({ error: "Erro ao marcar aviso como lido" }, { status: 500 });
  }
}
