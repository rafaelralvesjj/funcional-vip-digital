import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { studentId, content, title, type, expiresAt } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Conteúdo é obrigatório" },
        { status: 400 }
      );
    }

    const data: any = {
      content: content.trim(),
      type: type || "AVISO",
      title: title || null,
      author: { connect: { id: userId } },
    };

    if (studentId) {
      data.student = { connect: { id: studentId } };
    }

    if (expiresAt) {
      data.expiresAt = new Date(expiresAt);
    }

    const notice = await prisma.notice.create({
      data,
      include: {
        author: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar aviso:", error);
    return NextResponse.json(
      { error: "Erro ao criar aviso" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const studentId = searchParams.get("studentId") || undefined;
    const authorId = searchParams.get("authorId") || undefined;

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (authorId) where.authorId = authorId;

    const notices = await prisma.notice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error("Erro ao listar avisos:", error);
    return NextResponse.json(
      { error: "Erro ao listar avisos" },
      { status: 500 }
    );
  }
}
