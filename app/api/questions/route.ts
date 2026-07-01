import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

function deriveSenderRole(role: unknown): 'GESTOR' | 'TEACHER' | 'STUDENT' | null {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'GESTOR' || normalized === 'ADMIN' || normalized === 'ADMINISTRADOR') {
    return 'GESTOR';
  }
  if (normalized === 'TEACHER' || normalized === 'PROFESSOR' || normalized === 'INSTRUCTOR') {
    return 'TEACHER';
  }
  if (normalized === 'STUDENT' || normalized === 'ALUNO') {
    return 'STUDENT';
  }
  return null;
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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
    }
    const userId = session.user.id as string;
    const role = (session.user as any)?.role;
    const senderRole = deriveSenderRole(role);
    if (!senderRole) {
      return NextResponse.json({ message: 'Perfil inválido' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const studentIdParam = searchParams.get('studentId');
    const teacherIdParam = searchParams.get('teacherId');
    const senderRoleParam = searchParams.get('senderRole');
    const answeredByIdParam = searchParams.get('answeredById');
    // direction é aceito via query string, mas ignorado no where do Prisma

    const baseWhere: any = { parentId: null };

    if (answeredByIdParam) {
      baseWhere.answeredById = answeredByIdParam;
    }

    if (senderRole === 'GESTOR') {
      baseWhere.senderRole = senderRoleParam || 'GESTOR';
      if (studentIdParam) baseWhere.studentId = studentIdParam;
      if (teacherIdParam) baseWhere.teacherId = teacherIdParam;
    } else if (senderRole === 'TEACHER') {
      baseWhere.teacherId = userId;
      if (studentIdParam) baseWhere.studentId = studentIdParam;
      if (senderRoleParam) baseWhere.senderRole = senderRoleParam;
    } else if (senderRole === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json({ message: 'Aluno não encontrado' }, { status: 404 });
      }
      baseWhere.studentId = student.id;
      if (teacherIdParam) baseWhere.teacherId = teacherIdParam;
      if (senderRoleParam) baseWhere.senderRole = senderRoleParam;
    }

    const questions = await prisma.question.findMany({
      where: baseWhere,
      include: includePayload,
      orderBy: { createdAt: 'desc' as const },
      take: 100,
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error('[GET /api/questions]', error);
    return NextResponse.json({ message: 'Erro ao buscar mensagens' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
    }
    const userId = session.user.id as string;
    const role = (session.user as any)?.role;
    const senderRole = deriveSenderRole(role);
    if (!senderRole) {
      return NextResponse.json({ message: 'Perfil inválido' }, { status: 403 });
    }

    const body = await req.json();
    const { studentId, teacherId, recipientId, content, parentId } = body;

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return NextResponse.json({ message: 'Conteúdo obrigatório' }, { status: 400 });
    }

    let finalTeacherId: string | undefined = teacherId;
    if (!finalTeacherId && recipientId) {
      finalTeacherId = recipientId;
    }

    if (parentId) {
      const parent = await prisma.question.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ message: 'Mensagem pai não encontrada' }, { status: 404 });
      }

      const rootId = parent.parentId || parent.id;
      const root = await prisma.question.findUnique({ where: { id: rootId } });
      if (!root) {
        return NextResponse.json({ message: 'Thread não encontrada' }, { status: 404 });
      }

      const created = await prisma.question.create({
        data: {
          parentId: root.id,
          studentId: root.studentId,
          teacherId: root.teacherId,
          content: text,
          senderRole: senderRole as any,
          answeredById: userId,
        },
        include: includePayload,
      });

      return NextResponse.json(created, { status: 201 });
    }

    let finalStudentId: string | undefined = studentId;

    if (senderRole === 'STUDENT') {
      if (!finalStudentId) {
        const student = await prisma.student.findFirst({
          where: { userId },
          select: { id: true },
        });
        if (!student) {
          return NextResponse.json({ message: 'Aluno não encontrado' }, { status: 404 });
        }
        finalStudentId = student.id;
      }
      if (!finalTeacherId) {
        return NextResponse.json({ message: 'Professor destinatário obrigatório' }, { status: 400 });
      }
    } else if (senderRole === 'TEACHER') {
      finalTeacherId = finalTeacherId || userId;
      if (!finalStudentId) {
        return NextResponse.json({ message: 'Aluno destinatário obrigatório' }, { status: 400 });
      }
    } else if (senderRole === 'GESTOR') {
      if (!finalTeacherId || !finalStudentId) {
        return NextResponse.json({ message: 'Professor e aluno obrigatórios' }, { status: 400 });
      }
    }

    const created = await prisma.question.create({
      data: {
        studentId: finalStudentId!,
        teacherId: finalTeacherId!,
        content: text,
        senderRole: senderRole as any,
        answeredById: userId,
      },
      include: includePayload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[POST /api/questions]', error);
    return NextResponse.json({ message: 'Erro ao criar mensagem' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
    }
    const userId = session.user.id as string;
    const role = (session.user as any)?.role;
    const senderRole = deriveSenderRole(role);
    if (!senderRole) {
      return NextResponse.json({ message: 'Perfil inválido' }, { status: 403 });
    }

    const body = await req.json();
    const { id, answer, content } = body;

    const text = String(answer || content || '').trim();
    if (!id || !text) {
      return NextResponse.json({ message: 'ID e conteúdo obrigatórios' }, { status: 400 });
    }

    const target = await prisma.question.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ message: 'Mensagem não encontrada' }, { status: 404 });
    }

    const rootId = target.parentId || target.id;
    const root = await prisma.question.findUnique({ where: { id: rootId } });
    if (!root) {
      return NextResponse.json({ message: 'Thread não encontrada' }, { status: 404 });
    }

    const created = await prisma.question.create({
      data: {
        parentId: root.id,
        studentId: root.studentId,
        teacherId: root.teacherId,
        content: text,
        senderRole: senderRole as any,
        answeredById: userId,
      },
      include: includePayload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[PUT /api/questions]', error);
    return NextResponse.json({ message: 'Erro ao responder mensagem' }, { status: 500 });
  }
}
