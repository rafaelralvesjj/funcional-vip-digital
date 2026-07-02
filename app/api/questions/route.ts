import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

type SenderRole = "GESTOR" | "TEACHER" | "STUDENT";

function normalizeRole(value?: string | null): string {
  const roleValue = String(value || "").toUpperCase();

  if (roleValue === "ALUNO") return "STUDENT";
  if (roleValue === "PROFESSOR") return "TEACHER";

  return roleValue;
}

function getSenderRole(value: unknown, fallback: string): SenderRole {
  const role = normalizeRole(typeof value === "string" ? value : fallback);

  if (role === "STUDENT") return "STUDENT";
  if (role === "TEACHER") return "TEACHER";

  return "GESTOR";
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

function getSessionUser(session: unknown): { id?: string; role?: string } {
  if (!session || typeof session !== "object") return {};

  const sessionObj = session as { user?: unknown };

  if (!sessionObj.user || typeof sessionObj.user !== "object") return {};

  const userObj = sessionObj.user as { id?: unknown; role?: unknown };

  return {
    id: typeof userObj.id === "string" ? userObj.id : undefined,
    role: typeof userObj.role === "string" ? userObj.role : undefined,
  };
}

async function validateStudent(studentId: string) {
  return prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });
}

async function validateTeacher(teacherId: string) {
  return prisma.user.findFirst({
    where: {
      id: teacherId,
      role: {
        in: ["PROFESSOR", "TEACHER"],
      },
    },
    select: {
      id: true,
      name: true,
      role: true,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = sessionUser.id;
    const role = normalizeRole(sessionUser.role);

    const studentId = cleanId(searchParams.get("studentId"));
    const teacherId = cleanId(searchParams.get("teacherId"));
    const senderRole = cleanId(searchParams.get("senderRole"));
    const parentId = cleanId(searchParams.get("parentId"));

    const where: any = {};

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (parentId) where.parentId = parentId;
    if (senderRole) where.senderRole = normalizeRole(senderRole);

    if (!parentId) {
      where.parentId = null;
    }

    if (role === "TEACHER") {
      const myStudents = await prisma.student.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
        },
      });

      const myStudentIds = myStudents.map((student) => student.id);

      where.OR = [
        {
          teacherId: userId,
        },
        {
          studentId: {
            in: myStudentIds,
          },
        },
      ];
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
        return NextResponse.json([]);
      }

      where.studentId = student.id;
    }

    const questions = await prisma.question.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        answeredBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        children: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            answeredBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar mensagens" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const userId = sessionUser.id;
    const loggedRole = normalizeRole(sessionUser.role);
    const body = await req.json().catch(() => ({}));

    const content = cleanText(body.content);
    const requestedParentId = cleanId(body.parentId);
    const requestedStudentId = cleanId(body.studentId);
    const requestedTeacherId = cleanId(body.teacherId);
    const requestedAnsweredById = cleanId(body.answeredById);
    const videoUrl = cleanId(body.videoUrl);
    const imageUrl = cleanId(body.imageUrl);
    const senderRole = getSenderRole(body.senderRole, loggedRole || "GESTOR");

    if (!content) {
      return NextResponse.json(
        { error: "Mensagem é obrigatória" },
        { status: 400 }
      );
    }

    let parentId: string | null = null;
    let studentId: string | null = requestedStudentId;
    let teacherId: string | null = requestedTeacherId;

    if (requestedParentId) {
      const parentQuestion = await prisma.question.findUnique({
        where: {
          id: requestedParentId,
        },
        select: {
          id: true,
          parentId: true,
          studentId: true,
          teacherId: true,
          resolvedAt: true,
        },
      });

      if (!parentQuestion) {
        return NextResponse.json(
          { error: "Conversa original não encontrada" },
          { status: 404 }
        );
      }

      const rootQuestion = parentQuestion.parentId
        ? await prisma.question.findUnique({
            where: {
              id: parentQuestion.parentId,
            },
            select: {
              id: true,
              studentId: true,
              teacherId: true,
              resolvedAt: true,
            },
          })
        : parentQuestion;

      if (!rootQuestion) {
        return NextResponse.json(
          { error: "Conversa principal não encontrada" },
          { status: 404 }
        );
      }

      if (rootQuestion.resolvedAt) {
        return NextResponse.json(
          { error: "Esta conversa já foi encerrada" },
          { status: 400 }
        );
      }

      parentId = rootQuestion.id;
      studentId = studentId || rootQuestion.studentId || null;
      teacherId = teacherId || rootQuestion.teacherId || null;
    }

    /*
     * Regras:
     * - aluno pode enviar para professor: studentId + teacherId.
     * - aluno pode enviar para gestão: studentId sem teacherId.
     * - gestor pode enviar/responder para aluno ou professor.
     * - professor responde conversas em que ele é o teacherId.
     */
    if (!studentId && !teacherId) {
      return NextResponse.json(
        { error: "Selecione um aluno ou professor para a conversa" },
        { status: 400 }
      );
    }

    if (studentId) {
      const student = await validateStudent(studentId);

      if (!student) {
        return NextResponse.json(
          { error: "Aluno não encontrado" },
          { status: 404 }
        );
      }
    }

    if (teacherId) {
      const teacher = await validateTeacher(teacherId);

      if (!teacher) {
        return NextResponse.json(
          { error: "Professor não encontrado" },
          { status: 404 }
        );
      }
    }

    if (loggedRole === "TEACHER" && teacherId && teacherId !== userId) {
      return NextResponse.json(
        { error: "Você não tem permissão para responder esta conversa" },
        { status: 403 }
      );
    }

    const isReply = Boolean(parentId);
    const isAnswerFromStaff = isReply && senderRole !== "STUDENT";
    const answeredById = requestedAnsweredById || userId;

    const question = await prisma.question.create({
      data: {
        content,
        parentId,
        studentId,
        teacherId,
        senderRole,
        answeredById,
        videoUrl,
        imageUrl,
        ...(isAnswerFromStaff
          ? {
              answer: content,
              answeredAt: new Date(),
            }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        answeredBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        children: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            answeredBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao enviar mensagem" },
      { status: 500 }
    );
  }
}
