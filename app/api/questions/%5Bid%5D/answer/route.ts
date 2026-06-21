import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT /api/questions/[id]/answer
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { answer, answeredById } = body;

    if (!answer || !answeredById) {
      return NextResponse.json(
        { error: "answer e answeredById são obrigatórios" },
        { status: 400 }
      );
    }

    const question = await prisma.question.update({
      where: { id: params.id },
      data: {
        answer,
        answeredById,
        answeredAt: new Date(),
      },
      include: {
        student: {
          select: { name: true },
        },
        answeredBy: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(question);
  } catch (error) {
    console.error("Erro ao responder dúvida:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
