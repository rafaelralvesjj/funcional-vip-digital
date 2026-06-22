import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const notices = await prisma.notice.findMany({
      where: { studentId: params.studentId },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error("Erro ao buscar avisos:", error);
    return NextResponse.json({ error: "Erro ao buscar avisos" }, { status: 500 });
  }
}
