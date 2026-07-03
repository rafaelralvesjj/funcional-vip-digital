import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeRole(role?: string | null) {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const studentId = params.studentId;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        createdAt: true,
        userAuthId: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    const role = normalizeRole(sessionUser.role);

    const canAccess =
      role === "GESTOR" ||
      role === "ADMIN" ||
      student.userAuthId === String(sessionUser.id);

    if (!canAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    /*
     * Regra do mural do aluno:
     *
     * 1. Mostra apenas avisos destinados a ALUNO/STUDENT.
     * 2. Avisos internos da gestão, como "Novo aluno aguardando vínculo",
     *    podem ter studentId para controle operacional, mas NÃO aparecem
     *    no mural do aluno.
     * 3. Avisos gerais para alunos só aparecem para alunos que já existiam
     *    na data de criação do aviso.
     */
    const notices = await prisma.notice.findMany({
      where: {
        AND: [
          {
            OR: [
              { targetRole: "STUDENT" },
              { targetRole: "ALUNO" },
            ],
          },
          {
            OR: [
              {
                studentId,
              },
              {
                studentId: null,
                professorId: null,
                createdAt: {
                  gte: student.createdAt,
                },
              },
            ],
          },
          {
            NOT: [
              { targetRole: "GESTOR" },
              { targetRole: "ADMIN" },
              { type: "GESTAO_PENDENCIA" },
              { type: "MANAGEMENT_PENDING" },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        targetRole: true,
        studentId: true,
        professorId: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        reads: {
          where: {
            studentId,
          },
          select: {
            id: true,
            studentId: true,
            professorId: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedNotices = notices.map((notice) => ({
      ...notice,
      readByStudent: notice.reads.length > 0,
    }));

    return NextResponse.json({
      notices: formattedNotices,
    });
  } catch (error) {
    console.error("Erro ao buscar avisos do aluno:", error);

    return NextResponse.json(
      { error: "Erro ao buscar avisos do aluno" },
      { status: 500 }
    );
  }
}
