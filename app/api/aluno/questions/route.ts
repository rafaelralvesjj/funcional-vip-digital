import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { studentId, content } = await request.json();

    if (!studentId || !content) {
      return NextResponse.json(
        { error: "studentId e content são obrigatórios." },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        studentId,
        content,
      },
      include: {
        answeredBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar dúvida:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
