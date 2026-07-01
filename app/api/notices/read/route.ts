import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";

function normalizeRole(value?: string | null): string {
  const roleValue = String(value || "").toUpperCase();

  if (roleValue === "ALUNO") return "STUDENT";
  if (roleValue === "PROFESSOR") return "TEACHER";

  return roleValue;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = String(sessionUser.id);
    const role = normalizeRole(String(sessionUser.role || ""));
    const body = await req.json().catch(() => ({}));
    const noticeId = typeof body.noticeId === "string" ? body.noticeId.trim() : "";

    if (!noticeId) {
      return NextResponse.json({ error: "noticeId é obrigatório" }, { status: 400 });
    }

    const notice = await prisma.notice.findUnique({
      where: { id: noticeId },
      select: {
        id: true,
        targetRole: true,
        studentId: true,
        professorId: true,
      },
    });

    if (!notice) {
      return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
    }

    const targetRole = normalizeRole(notice.targetRole);

    if (role === "TEACHER") {
      if (targetRole !== "TEACHER") {
        return NextResponse.json(
          { error: "Este aviso não é direcionado a professores" },
          { status: 403 }
        );
      }

      if (notice.professorId && notice.professorId !== userId) {
        return NextResponse.json(
          { error: "Este aviso não é direcionado a este professor" },
          { status: 403 }
        );
      }

      const read = await prisma.noticeRead.upsert({
        where: {
          noticeId_professorId: {
            noticeId,
            professorId: userId,
          },
        },
        update: {},
        create: {
          noticeId,
          professorId: userId,
        },
      });

      return NextResponse.json({ success: true, read });
    }

    if (role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: {
          userAuthId: userId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return NextResponse.json(
          { error: "Aluno autenticado não encontrado" },
          { status: 404 }
        );
      }

      if (targetRole !== "STUDENT") {
        return NextResponse.json(
          { error: "Este aviso não é direcionado a alunos" },
          { status: 403 }
        );
      }

      if (notice.studentId && notice.studentId !== student.id) {
        return NextResponse.json(
          { error: "Este aviso não é direcionado a este aluno" },
          { status: 403 }
        );
      }

      const read = await prisma.noticeRead.upsert({
        where: {
          noticeId_studentId: {
            noticeId,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          noticeId,
          studentId: student.id,
        },
      });

      return NextResponse.json({ success: true, read });
    }

    return NextResponse.json(
      { error: "Perfil sem permissão para marcar aviso como lido" },
      { status: 403 }
    );
  } catch (error) {
    console.error("POST /api/notices/read error:", error);
    return NextResponse.json({ error: "Erro ao marcar aviso como lido" }, { status: 500 });
  }
}
