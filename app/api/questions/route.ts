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

    const where: any = {
      parentId: null, // só perguntas raiz
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

    if (!content) {
      return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });
    }

    const role = senderRole || "STUDENT";

    // Monta os dados
    const questionData: any = {
      content: content.trim(),
      senderRole: role,
    };

    // studentId: obrigatório para STUDENT, opcional para GESTOR/TEACHER
    if (studentId) {
      questionData.studentId = studentId;
    } else if (role === "STUDENT") {
      return NextResponse.json({ error: "studentId é obrigatório para aluno" }, { status: 400 });
    } else {
      // GESTOR ou TEACHER sem studentId específico - buscar automaticamente
      if (teacherId) {
        const student = await prisma.student.findFirst({
          where: { userId: teacherId },
          orderBy: { name: "asc" },
          select: { id: true },
        });
        if (student) questionData.studentId = student.id;
      }
      if (!questionData.studentId) {
        const firstStudent = await prisma.student.findFirst({
          orderBy: { name: "asc" },
          select: { id: true },
        });
        if (firstStudent) questionData.studentId = firstStudent.id;
      }
    }

    if (teacherId) questionData.teacherId = teacherId;
    if (parentId) questionData.parentId = parentId;
    if (answeredById) questionData.answeredById = answeredById;

    if (!questionData.studentId) {
      return NextResponse.json({ error: "Nenhum aluno encontrado no sistema" }, { status: 400 });
    }

    const question = await prisma.question.create({
      data: questionData,
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

// PUT /api/questions - Responder pergunta (usa body.id, NÃO params.id)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, answer, answeredById } = body;

    if (!id || !answer || !answeredById) {
      return NextResponse.json(
        { error: "id, answer e answeredById são obrigatórios" },
        { status: 400 }
      );
    }

    const question = await prisma.question.update({
      where: { id },
      data: { answer, answeredById, answeredAt: new Date() },
      include: {
        student: { select: { name: true } },
        answeredBy: { select: { name: true } },
      },
    });

    return NextResponse.json(question);
  } catch (error) {
    console.error("PUT /api/questions error:", error);
    return NextResponse.json({ error: "Erro ao responder" }, { status: 500 });
  }
}
