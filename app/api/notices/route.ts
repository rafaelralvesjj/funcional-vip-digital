import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    }

    const notices = await prisma.notice.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error("[GET /api/notices]", error);
    return NextResponse.json(
      { message: "Erro ao buscar avisos" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, published } = body;

    if (!title || !content) {
      return NextResponse.json(
        { message: "Título e conteúdo são obrigatórios" },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        published: published ?? false,
        userId: session.user.id,
      },
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("[POST /api/notices]", error);
    return NextResponse.json(
      { message: "Erro ao criar aviso" },
      { status: 500 }
    );
  }
}
