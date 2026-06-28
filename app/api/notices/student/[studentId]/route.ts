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
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const { studentId } = params;

    if (!studentId) {
      return NextResponse.json(
        { error: "ID do aluno e obrigatorio" },
        { status: 400 }
      );
    }

    const notices = await prisma.notice.findMany({
      where: {
        OR: [
          { studentId },
          { studentId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    // Tenta buscar leituras, mas funciona mesmo se a tabela nao existir
    let noticesWithReadStatus = notices;
    try {
      const reads = await prisma.noticeRead.findMany({
        where: { studentId },
        select: { noticeId: true },
      });
      const readNoticeIds = new Set(reads.map((r: any) => r.noticeId));
      noticesWithReadStatus = notices.map((notice) => ({
        ...notice,
        readByStudent: readNoticeIds.has(notice.id),
      }));
    } catch {
      noticesWithReadStatus = notices.map((notice) => ({
        ...notice,
        readByStudent: false,
      }));
    }

    return NextResponse.json(noticesWithReadStatus);
  } catch (error) {
    console.error("Erro ao buscar avisos do aluno:", error);
    return NextResponse.json(
      { error: "Erro ao buscar avisos" },
      { status: 500 }
    );
  }
}
