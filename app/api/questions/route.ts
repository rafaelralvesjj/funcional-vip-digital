import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

type SenderRole = 'GESTOR' | 'TEACHER' | 'STUDENT';

type SessionUser = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
};

function getSessionUser(session: unknown): SessionUser | null {
  if (!session || typeof session !== 'object') return null;

  const possibleSession = session as { user?: unknown };

  if (!possibleSession.user || typeof possibleSession.user !== 'object') {
    return null;
  }

  return possibleSession.user as SessionUser;
}

function getSessionUserId(user: SessionUser | null): string | null {
  if (!user) return null;

  return typeof user.id === 'string' && user.id.trim() !== ''
    ? user.id.trim()
    : null;
}

function deriveSenderRole(role: unknown): SenderRole | null {
  if (typeof role !== 'string') return null;

  const upper = role.trim().toUpperCase();

  if (upper === 'GESTOR') return 'GESTOR';
  if (upper === 'TEACHER' || upper === 'PROFESSOR') return 'TEACHER';
  if (upper === 'STUDENT' || upper === 'ALUNO') return 'STUDENT';

  return null;
}

function getStringFromBody(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getOptionalId(value: unknown): string | null {
  const id = getStringFromBody(value);
  return id !== '' ? id : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Erro desconhecido';
}

const includePayload = {
  student: true,
  teacher: true,
  answeredBy: true,
  parent: {
    include: {
      student: true,
      teacher: true,
      answeredBy: true,
    },
  },
  children: {
    include: {
      student: true,
      teacher: true,
      answeredBy: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.QuestionInclude;

async function validateRecipientExists(params: {
  studentId: string | null;
  teacherId: string | null;
}) {
  const { studentId, teacherId } = params;

  if (studentId) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });

    if (!student) {
      return NextResponse.json(
        { message: 'Aluno destinatário não encontrado' },
        { status: 400 }
      );
    }
  }

  if (teacherId) {
    const teacher = await prisma.user.findFirst({
      where: {
        id: teacherId,
        role: {
          in: ['PROFESSOR', 'TEACHER'],
        },
      },
      select: { id: true },
    });

    if (!teacher) {
      return NextResponse.json(
        { message: 'Professor destinatário não encontrado' },
        { status: 400 }
      );
    }
  }

  return null;
}

function buildQuestionCreateData(params: {
  content: string;
  senderRole: SenderRole;
  studentId: string | null;
  teacherId: string | null;
  parentId: string | null;
  answeredById: string | null;
}) {
  const { content, senderRole, studentId, teacherId, parentId, answeredById } = params;

  const data: Prisma.QuestionUncheckedCreateInput = {
    content,
    senderRole,
  };

  if (studentId) {
    data.studentId = studentId;
  }

  if (teacherId) {
    data.teacherId = teacherId;
  }

  if (parentId) {
    data.parentId = parentId;
  }

  if (parentId && answeredById) {
    data.answeredById = answeredById;
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const studentId = searchParams.get('studentId')?.trim();
    const teacherId = searchParams.get('teacherId')?.trim();
    const parentId = searchParams.get('parentId')?.trim();
    const senderRoleParam = searchParams.get('senderRole')?.trim();

    const where: Prisma.QuestionWhereInput = {};

    if (studentId) {
      where.studentId = studentId;
    }

    if (teacherId) {
      where.teacherId = teacherId;
    }

    if (parentId) {
      where.parentId = parentId;
    }

    if (senderRoleParam) {
      const normalizedSenderRole = deriveSenderRole(senderRoleParam);

      if (!normalizedSenderRole) {
        return NextResponse.json(
          { message: 'Papel do remetente inválido' },
          { status: 400 }
        );
      }

      where.senderRole = normalizedSenderRole;
    }

    const questions = await prisma.question.findMany({
      where,
      include: includePayload,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error('GET /api/questions error:', error);

    return NextResponse.json(
      {
        message: 'Erro ao buscar mensagens',
        detail: process.env.NODE_ENV !== 'production' ? getErrorMessage(error) : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const userId = getSessionUserId(sessionUser);
    const body = await req.json().catch(() => ({}));

    const content = getStringFromBody(body.content);

    if (!content) {
      return NextResponse.json(
        { message: 'Conteúdo da mensagem é obrigatório' },
        { status: 400 }
      );
    }

    const senderRole = deriveSenderRole(body.senderRole);

    if (!senderRole) {
      return NextResponse.json(
        { message: 'Papel do remetente inválido' },
        { status: 400 }
      );
    }

    const studentId = getOptionalId(body.studentId);
    const teacherId = getOptionalId(body.teacherId);
    const parentId = getOptionalId(body.parentId);

    if (senderRole === 'GESTOR' && !studentId && !teacherId) {
      return NextResponse.json(
        { message: 'Informe um aluno ou professor destinatário' },
        { status: 400 }
      );
    }

    if (senderRole === 'STUDENT' && !teacherId) {
      return NextResponse.json(
        { message: 'Professor é obrigatório' },
        { status: 400 }
      );
    }

    if (senderRole === 'TEACHER' && !studentId) {
      return NextResponse.json(
        { message: 'Aluno é obrigatório' },
        { status: 400 }
      );
    }

    const recipientValidationError = await validateRecipientExists({
      studentId,
      teacherId,
    });

    if (recipientValidationError) {
      return recipientValidationError;
    }

    const created = await prisma.question.create({
      data: buildQuestionCreateData({
        content,
        senderRole,
        studentId,
        teacherId,
        parentId,
        answeredById: userId,
      }),
      include: includePayload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/questions error:', error);

    return NextResponse.json(
      {
        message: 'Erro ao criar mensagem',
        detail: process.env.NODE_ENV !== 'production' ? getErrorMessage(error) : undefined,
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = getSessionUser(session);

    if (!sessionUser) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const id = getStringFromBody(body.id);

    if (!id) {
      return NextResponse.json(
        { message: 'ID da mensagem é obrigatório' },
        { status: 400 }
      );
    }

    const data: Prisma.QuestionUncheckedUpdateInput = {};

    const content = getStringFromBody(body.content);

    if (content) {
      data.content = content;
    }

    if (typeof body.studentId === 'string') {
      const studentId = body.studentId.trim();
      data.studentId = studentId !== '' ? studentId : null;
    }

    if (typeof body.teacherId === 'string') {
      const teacherId = body.teacherId.trim();
      data.teacherId = teacherId !== '' ? teacherId : null;
    }

    if (typeof body.answeredById === 'string') {
      const answeredById = body.answeredById.trim();
      data.answeredById = answeredById !== '' ? answeredById : null;
    }

    const studentId = typeof data.studentId === 'string' ? data.studentId : null;
    const teacherId = typeof data.teacherId === 'string' ? data.teacherId : null;

    const recipientValidationError = await validateRecipientExists({
      studentId,
      teacherId,
    });

    if (recipientValidationError) {
      return recipientValidationError;
    }

    const updated = await prisma.question.update({
      where: { id },
      data,
      include: includePayload,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/questions error:', error);

    return NextResponse.json(
      {
        message: 'Erro ao atualizar mensagem',
        detail: process.env.NODE_ENV !== 'production' ? getErrorMessage(error) : undefined,
      },
      { status: 500 }
    );
  }
}
