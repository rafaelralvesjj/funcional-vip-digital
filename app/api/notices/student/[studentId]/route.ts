import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { studentId } = params;

    if (!studentId) {
      return NextResponse.json(
        { error: "ID do aluno é obrigatório" },
        { status: 400 }
      );
    }

    const notices = await prisma.notice.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error("Erro ao buscar avisos do aluno:", error);
    return NextResponse.json(
      { error: "Erro ao buscar avisos" },
      { status: 500 }
    );
  }
}
