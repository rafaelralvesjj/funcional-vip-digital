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
        author: { select: { id: true, name: true, role: true } },
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
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    let noticesWithReadStatus = notices;
    if (studentId) {
      try {
        const reads = await prisma.noticeRead.findMany({
          where: { studentId },
          select: { noticeId: true },
        });
        const readNoticeIds = new Set(reads.map((r: any) => r.noticeId));
        noticesWithReadStatus = notices.map((notice: any) => ({
          ...notice,
          readByStudent: readNoticeIds.has(notice.id),
        }));
      } catch {
        noticesWithReadStatus = notices.map((notice: any) => ({
          ...notice,
          readByStudent: false,
        }));
      }
    }

    return NextResponse.json(noticesWithReadStatus);
  } catch (error) {
    console.error("Erro ao listar avisos:", error);
    return NextResponse.json(
      { error: "Erro ao listar avisos" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, title, content, expiresAt } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do aviso é obrigatório" },
        { status: 400 }
      );
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (expiresAt !== undefined) {
      data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    const notice = await prisma.notice.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notice);
  } catch (error) {
    console.error("Erro ao editar aviso:", error);
    return NextResponse.json(
      { error: "Erro ao editar aviso" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do aviso é obrigatório" },
        { status: 400 }
      );
    }

    await prisma.notice.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir aviso:", error);
    return NextResponse.json(
      { error: "Erro ao excluir aviso" },
      { status: 500 }
    );
  }
}
