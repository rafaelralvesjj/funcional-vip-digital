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
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno nao encontrado" },
        { status: 404 }
      );
    }

    /*
     * Regra do mural do aluno:
     *
     * 1. Avisos específicos só aparecem no mural se forem destinados a ALUNO/STUDENT.
     * 2. Pendências internas da gestão usam studentId para controle operacional,
     *    mas não aparecem no mural do aluno.
     * 3. Avisos gerais para alunos só aparecem para alunos que já existiam
     *    na data em que o aviso foi criado.
     *
     * Importante:
     * Mantemos o retorno como ARRAY, porque a tela do aluno já espera uma lista direta.
     */
    const notices = await prisma.notice.findMany({
      where: {
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
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
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
