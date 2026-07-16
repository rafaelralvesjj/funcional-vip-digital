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
  const role = String((session?.user as any)?.role || "").toUpperCase();

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

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        userAuthId: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno nao encontrado" },
        { status: 404 }
      );
    }

    const normalizedRole =
      role === "PROFESSOR" ? "TEACHER" : role === "ALUNO" ? "STUDENT" : role;

    const canAccess =
      normalizedRole === "GESTOR" ||
      normalizedRole === "ADMIN" ||
      student.userAuthId === userId ||
      student.userId === userId;

    if (!canAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    /*
     * Regra do mural/histórico de avisos do aluno:
     *
     * 1. Mostra apenas avisos destinados a ALUNO/STUDENT.
     * 2. Pendências internas da gestão usam studentId para controle operacional,
     *    mas não aparecem nem no mural do aluno nem na visão do professor.
     * 3. Avisos gerais para alunos só aparecem para alunos que já existiam
     *    na data em que o aviso foi criado.
     */
    const now = new Date();

    const notices = await prisma.notice.findMany({
      where: {
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: now } },
            ],
          },
          {
            OR: [
          {
            studentId,
            targetRole: {
              in: ["ALUNO", "STUDENT"],
            },
            NOT: {
              type: {
                in: ["GESTAO_PENDENCIA", "MANAGEMENT_PENDING"],
              },
            },
          },
          {
            studentId: null,
            professorId: null,
            targetRole: {
              in: ["ALUNO", "STUDENT"],
            },
            createdAt: {
              gte: student.createdAt,
            },
            NOT: {
              type: {
                in: ["GESTAO_PENDENCIA", "MANAGEMENT_PENDING"],
              },
            },
          },
            ],
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            image: true,
          },
        },
      },
    });

    let noticesWithReadStatus = notices;

    try {
      const reads = await prisma.noticeRead.findMany({
        where: {
          studentId,
        },
        select: {
          noticeId: true,
        },
      });

      const readNoticeIds = new Set(reads.map((read: any) => read.noticeId));

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
