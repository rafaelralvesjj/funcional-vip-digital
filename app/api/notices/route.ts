import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const authorId = searchParams.get("authorId");
    const targetRole = searchParams.get("targetRole");
    const professorId = searchParams.get("professorId");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where: any = {};

    // Filtro por targetRole (ALUNO ou PROFESSOR)
    if (targetRole) {
      where.targetRole = targetRole;
    }

    // Se pediu de um aluno específico: avisos gerais (studentId null) OU específicos daquele aluno
    if (studentId) {
      where.OR = [
        { studentId: null },
        { studentId: studentId },
      ];
    }

    // Se pediu de um autor específico (professor/gestor)
    if (authorId) {
      where.authorId = authorId;
    }

    // Se pediu avisos para um professor específico
    if (professorId) {
      where.OR = [
        { professorId: null },
        { professorId: professorId },
      ];
    }

    const notices = await prisma.notice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: { id: true, name: true, role: true },
        },
        student: {
          select: { id: true, name: true },
        },
        professor: {
          select: { id: true, name: true },
        },
        reads: studentId
          ? {
              where: { studentId },
              select: { studentId: true, createdAt: true },
            }
          : false,
      },
      take: 50,
    });

    // Formatar resposta
    const formatted = notices.map((notice: any) => {
      const result: any = {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        type: notice.type,
        authorId: notice.authorId,
        studentId: notice.studentId,
        targetRole: notice.targetRole,
        professorId: notice.professorId,
        createdAt: notice.createdAt,
        updatedAt: notice.updatedAt,
        author: notice.author,
        student: notice.student,
        professor: notice.professor,
      };

      // Se tem reads e pediu studentId, adicionar readByStudent
      if (notice.reads && Array.isArray(notice.reads)) {
        result.readByStudent = notice.reads.length > 0;
        result.readAt = notice.reads[0]?.createdAt || null;
      }

      return result;
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("GET /api/notices error:", error);
    return NextResponse.json({ error: "Erro ao buscar avisos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, type, studentId, authorId, targetRole, professorId } = body;

    if (!content || !authorId) {
      return NextResponse.json(
        { error: "content e authorId são obrigatórios" },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.create({
      data: {
        title: title?.trim() || null,
        content: content.trim(),
        type: type || "AVISO",
        authorId,
        studentId: studentId || null,
        targetRole: targetRole || "ALUNO",
        professorId: professorId || null,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
        professor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("POST /api/notices error:", error);
    return NextResponse.json({ error: "Erro ao criar aviso" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, content } = body;

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;

    const notice = await prisma.notice.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
        professor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(notice);
  } catch (error) {
    console.error("PUT /api/notices error:", error);
    return NextResponse.json({ error: "Erro ao atualizar aviso" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    await prisma.notice.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notices error:", error);
    return NextResponse.json({ error: "Erro ao deletar aviso" }, { status: 500 });
  }
}
