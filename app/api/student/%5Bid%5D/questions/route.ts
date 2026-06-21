import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/student/[id]/questions
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const questions = await prisma.question.findMany({
      where: { studentId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
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

// POST /api/student/[id]/questions
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { content, videoUrl, imageUrl } = body;

    if (!content) {
      return NextResponse.json(
        { error: "O campo content é obrigatório" },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        studentId: params.id,
        content,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
      },
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar dúvida:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
