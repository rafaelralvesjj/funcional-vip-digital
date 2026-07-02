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

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const body: Record<string, unknown> = {};

    form.forEach((value, key) => {
      if (typeof value === "string") {
        body[key] = value;
      } else if (value instanceof File) {
        body[key] = value;
      }
    });

    return body;
  }

  try {
    const json = await req.json();

    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }

    return {};
  } catch {
    return {};
  }
}

async function getStudentFromSessionOrId(userId: string, studentId?: string | null) {
  if (studentId) {
    return prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        name: true,
        userId: true,
        userAuthId: true,
      },
    });
  }

  return prisma.student.findFirst({
    where: {
      userAuthId: userId,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      userAuthId: true,
    },
  });
}

function getQuestionIncludes() {
  return {
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
        createdAt: "asc" as const,
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
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = cleanId(searchParams.get("studentId"));
    const student = await getStudentFromSessionOrId(String(sessionUser.id), studentId);

    if (!student) {
      return NextResponse.json([]);
    }

    const questions = await prisma.question.findMany({
      where: {
        studentId: student.id,
        parentId: null,
      },
      include: getQuestionIncludes(),
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("GET /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dúvidas" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await readBody(req);
    const userId = String(sessionUser.id);
    const content = cleanText(body.content || body.question || body.message);
    const studentIdFromBody = cleanId(body.studentId);
    const parentId = cleanId(body.parentId);
    const target = String(body.target || body.targetType || "PROFESSOR").toUpperCase();

    if (!content) {
      return NextResponse.json(
        { error: "Mensagem é obrigatória" },
        { status: 400 }
      );
    }

    const student = await getStudentFromSessionOrId(userId, studentIdFromBody);

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado" },
        { status: 404 }
      );
    }

    let rootQuestion: {
      id: string;
      studentId: string | null;
      teacherId: string | null;
      resolvedAt: Date | null;
    } | null = null;

    if (parentId) {
      const parent = await prisma.question.findUnique({
        where: {
          id: parentId,
        },
        select: {
          id: true,
          parentId: true,
          studentId: true,
          teacherId: true,
          resolvedAt: true,
        },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "Conversa não encontrada" },
          { status: 404 }
        );
      }

      rootQuestion = parent.parentId
        ? await prisma.question.findUnique({
            where: {
              id: parent.parentId,
            },
            select: {
              id: true,
              studentId: true,
              teacherId: true,
              resolvedAt: true,
            },
          })
        : parent;

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

      if (rootQuestion.studentId !== student.id) {
        return NextResponse.json(
          { error: "Você não tem permissão para responder esta conversa" },
          { status: 403 }
        );
      }
    }

    const sendToGestao =
      target === "GESTAO" ||
      target === "GESTÃO" ||
      target === "GESTOR" ||
      target === "MANAGEMENT";

    const teacherId = rootQuestion
      ? rootQuestion.teacherId
      : sendToGestao
        ? null
        : student.userId;

    if (!rootQuestion && !sendToGestao && !teacherId) {
      return NextResponse.json(
        { error: "Aluno sem professor vinculado" },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        content,
        studentId: student.id,
        teacherId,
        parentId: rootQuestion?.id || null,
        senderRole: "STUDENT",
        answeredById: userId,
      },
      include: getQuestionIncludes(),
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error("POST /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao enviar dúvida" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const role = normalizeRole(String(sessionUser.role || ""));
    const userId = String(sessionUser.id);
    const body = await readBody(req);

    const questionId = cleanId(body.id || body.questionId);
    const answer = cleanText(body.answer || body.content);

    if (!questionId) {
      return NextResponse.json(
        { error: "ID da dúvida é obrigatório" },
        { status: 400 }
      );
    }

    if (!answer) {
      return NextResponse.json(
        { error: "Resposta é obrigatória" },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        teacherId: true,
        resolvedAt: true,
        student: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: "Dúvida não encontrada" },
        { status: 404 }
      );
    }

    const rootQuestion = question.parentId
      ? await prisma.question.findUnique({
          where: {
            id: question.parentId,
          },
          select: {
            id: true,
            studentId: true,
            teacherId: true,
            resolvedAt: true,
            student: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        })
      : question;

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

    const canAnswerAsTeacher =
      role === "TEACHER" &&
      (rootQuestion.teacherId === userId || rootQuestion.student?.userId === userId);

    const canAnswerAsGestor =
      (role === "GESTOR" || role === "ADMIN") && !rootQuestion.teacherId;

    if (!canAnswerAsTeacher && !canAnswerAsGestor) {
      return NextResponse.json(
        { error: "Você não tem permissão para responder esta conversa" },
        { status: 403 }
      );
    }

    const senderRole = canAnswerAsTeacher ? "TEACHER" : "GESTOR";
    const now = new Date();

    const reply = await prisma.question.create({
      data: {
        content: answer,
        answer,
        answeredAt: now,
        answeredById: userId,
        parentId: rootQuestion.id,
        studentId: rootQuestion.studentId,
        teacherId: rootQuestion.teacherId,
        senderRole,
      },
    });

    const updatedRoot = await prisma.question.findUnique({
      where: {
        id: rootQuestion.id,
      },
      include: getQuestionIncludes(),
    });

    return NextResponse.json({
      success: true,
      reply,
      question: updatedRoot,
    });
  } catch (error) {
    console.error("PUT /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao responder dúvida" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await readBody(req);
    const questionId = cleanId(body.id || body.questionId);
    const action = cleanText(body.action);

    if (!questionId) {
      return NextResponse.json(
        { error: "ID da dúvida é obrigatório" },
        { status: 400 }
      );
    }

    if (action !== "resolve") {
      return NextResponse.json(
        { error: "Ação inválida" },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      select: {
        id: true,
        parentId: true,
        studentId: true,
      },
    });

    if (!question) {
      return NextResponse.json(
        { error: "Dúvida não encontrada" },
        { status: 404 }
      );
    }

    const rootQuestionId = question.parentId || question.id;

    const updated = await prisma.question.update({
      where: {
        id: rootQuestionId,
      },
      data: {
        resolvedAt: new Date(),
      },
      include: getQuestionIncludes(),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/aluno/questions error:", error);
    return NextResponse.json(
      { error: "Erro ao encerrar dúvida" },
      { status: 500 }
    );
  }
}
