import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/questions - Listar perguntas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const teacherId = searchParams.get("teacherId");
    const senderRole = searchParams.get("senderRole");
    const answeredById = searchParams.get("answeredById");
    const parentId = searchParams.get("parentId");

    const where: any = {
      parentId: parentId || null,
    };

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (senderRole) where.senderRole = senderRole;
    if (answeredById) where.answeredById = answeredById;

    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, name: true } },
        answeredBy: { select: { id: true, name: true, role: true } },
        teacher: { select: { id: true, name: true } },
        children: {
          orderBy: { createdAt: "asc" },
          include: { answeredBy: { select: { id: true, name: true, role: true } } },
        },
      },
      take: 50,
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json({ error: "Erro ao buscar perguntas" }, { status: 500 });
  }
}

// POST /api/questions - Criar pergunta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, teacherId, content, parentId, senderRole, answeredById } = body;

    if (!content || !studentId) {
      return NextResponse.json({ error: "content e studentId são obrigatórios" }, { status: 400 });
    }

    const question = await prisma.question.create({
      data: {
        studentId,
        teacherId: teacherId || null,
        content: content.trim(),
        parentId: parentId || null,
        senderRole: senderRole || "STUDENT",
        answeredById: answeredById || null,
      },
      include: {
        student: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        answeredBy: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json({ error: "Erro ao criar pergunta" }, { status: 500 });
  }
}

// PUT /api/questions/[id]/answer - Responder pergunta
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
      data: { answer, answeredById, answeredAt: new Date() },
      include: {
        student: { select: { name: true } },
        answeredBy: { select: { name: true } },
      },
    });

    return NextResponse.json(question);
  } catch (error) {
    console.error("Erro ao responder dúvida:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
