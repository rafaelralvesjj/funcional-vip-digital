import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

type SenderRole = 'STUDENT' | 'TEACHER' | 'GESTOR';

function deriveSenderRole(role: unknown): SenderRole {
  const r = String(role || '').toUpperCase();
  if (r === 'STUDENT' || r === 'TEACHER' || r === 'GESTOR') return r;
  return 'STUDENT';
}

const includePayload = {
  student: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
  answeredBy: { select: { id: true, name: true, role: true } },
  children: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      answeredBy: { select: { id: true, name: true, role: true } },
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
    },
  },
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const role = deriveSenderRole((session.user as any)?.role);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || undefined;
    const teacherId = searchParams.get('teacherId') || undefined;
    const senderRoleParam = searchParams.get('senderRole') || undefined;
    const answeredById = searchParams.get('answeredById') || undefined;
    const direction = searchParams.get('direction') || undefined;

    let where: any = { parentId: null };

    if (role === 'GESTOR') {
      where.senderRole = senderRoleParam || 'GESTOR';
      if (studentId) where.studentId = studentId;
      if (teacherId) where.teacherId = teacherId;
      if (answeredById) where.answeredById = answeredById;
    } else if (role === 'TEACHER') {
      where.teacherId = userId;
      if (studentId) where.studentId = studentId;
      if (senderRoleParam) where.senderRole = senderRoleParam;
      if (answeredById) where.answeredById = answeredById;
    } else {
      const student = await prisma.student.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json({ questions: [] }, { status: 200 });
      }
      where.studentId = student.id;
      if (senderRoleParam) where.senderRole = senderRoleParam;
      if (answeredById) where.answeredById = answeredById;
    }

    const questions = await prisma.question.findMany({
      where,
      include: includePayload,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ questions }, { status: 200 });
  } catch (error) {
    console.error('GET /api/questions error:', error);
    return NextResponse.json({ error: 'Erro ao buscar dúvidas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const role = deriveSenderRole((session.user as any)?.role);
    const userId = session.user.id;

    const body = await request.json();
    let { studentId, teacherId, recipientId, content, parentId } = body;

    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    if (!trimmedContent) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 400 });
    }

    if (parentId) {
      const parent = await prisma.question.findUnique({
        where: { id: String(parentId) },
      });

      if (!parent) {
        return NextResponse.json({ error: 'Mensagem pai não encontrada' }, { status: 404 });
      }

      const rootId = parent.parentId || parent.id;
      const root = await prisma.question.findUnique({
        where: { id: rootId },
      });

      if (!root) {
        return NextResponse.json({ error: 'Thread raiz não encontrada' }, { status: 404 });
      }

      const child = await prisma.question.create({
        data: {
          studentId: root.studentId,
          teacherId: root.teacherId,
          content: trimmedContent,
          parentId: root.id,
          senderRole: role,
          answeredById: userId,
        },
        include: includePayload,
      });

      return NextResponse.json({ question: child }, { status: 201 });
    }

    if (role === 'STUDENT') {
      if (!studentId) {
        const student = await prisma.student.findFirst({
          where: { userId },
          select: { id: true },
        });
        if (!student) {
          return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 400 });
        }
        studentId = student.id;
      }
      if (!teacherId && recipientId) {
        teacherId = recipientId;
      }
      if (!teacherId) {
        return NextResponse.json({ error: 'Professor é obrigatório' }, { status: 400 });
      }
    } else if (role === 'TEACHER') {
      const finalTeacherId = teacherId || userId;
      if (!studentId) {
        return NextResponse.json({ error: 'Aluno é obrigatório' }, { status: 400 });
      }
      studentId = studentId;
      teacherId = finalTeacherId;
    } else if (role === 'GESTOR') {
      if (!studentId || !teacherId) {
        return NextResponse.json({ error: 'Aluno e professor são obrigatórios' }, { status: 400 });
      }
    }

    const created = await prisma.question.create({
      data: {
        studentId: String(studentId),
        teacherId: String(teacherId),
        content: trimmedContent,
        parentId: null,
        senderRole: role,
        answeredById: userId,
      },
      include: includePayload,
    });

    return NextResponse.json({ question: created }, { status: 201 });
  } catch (error) {
    console.error('POST /api/questions error:', error);
    return NextResponse.json({ error: 'Erro ao criar dúvida' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const role = deriveSenderRole((session.user as any)?.role);
    const userId = session.user.id;

    const body = await request.json();
    const { id, answer, content } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const text = typeof answer === 'string' && answer.trim() ? answer.trim()
      : typeof content === 'string' && content.trim() ? content.trim()
      : '';

    if (!text) {
      return NextResponse.json({ error: 'Resposta é obrigatória' }, { status: 400 });
    }

    const target = await prisma.question.findUnique({
      where: { id: String(id) },
    });

    if (!target) {
      return NextResponse.json({ error: 'Dúvida não encontrada' }, { status: 404 });
    }

    const rootId = target.parentId || target.id;
    const root = await prisma.question.findUnique({
      where: { id: rootId },
    });

    if (!root) {
      return NextResponse.json({ error: 'Thread raiz não encontrada' }, { status: 404 });
    }

    const reply = await prisma.question.create({
      data: {
        studentId: root.studentId,
        teacherId: root.teacherId,
        content: text,
        parentId: root.id,
        senderRole: role,
        answeredById: userId,
      },
      include: includePayload,
    });

    return NextResponse.json({ question: reply }, { status: 201 });
  } catch (error) {
    console.error('PUT /api/questions error:', error);
    return NextResponse.json({ error: 'Erro ao responder dúvida' }, { status: 500 });
  }
}
