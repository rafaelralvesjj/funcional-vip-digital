import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/gestor/duvidas
export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: { name: true },
        },
        answeredBy: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("Erro ao buscar dúvidas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
