import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

function deriveSenderRole(role: string | undefined | null): 'GESTOR' | 'TEACHER' | 'STUDENT' | null {
  if (!role) return null;
  const r = role.toUpperCase();
  if (r === 'GESTOR' || r === 'ADMIN') return 'GESTOR';
  if (r === 'TEACHER' || r === 'PROFESSOR') return 'TEACHER';
  if (r === 'STUDENT' || r === 'ALUNO') return 'STUDENT';
  return null;
}

const includePayload = {
  student: true,
  teacher: true,
  answeredBy: true,
  children: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      answeredBy: true,
      student: true,
      teacher: true,
    },
  },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const role = deriveSenderRole((session.user as any)?.role);
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId') || undefined;
  const teacherId = searchParams.get('teacherId') || undefined;
  const senderRoleParam = searchParams.get('senderRole') || undefined;
  const answeredById = searchParams.get('answeredById') || undefined;
  const direction = searchParams.get('direction') || undefined;

  const where: any = {
    parentId: null,
  };

  if (role === 'GESTOR') {
    where.senderRole = senderRoleParam || 'GESTOR';
  } else if (role === 'TEACHER') {
    where.teacherId = session.user.id;
  } else if (role === 'STUDENT') {
    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json([], { status: 200 });
    }
    where.studentId = student.id;
  }

  if (studentId) where.studentId = studentId;
  if (teacherId) where.teacherId = teacherId;
  if (answeredById) where.answeredById = answeredById;
  // direction is intentionally not used in the Prisma where clause

  const questions = await prisma.question.findMany({
    where,
    include: includePayload,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(questions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const senderRole = deriveSenderRole((session.user as any)?.role);
  if (!senderRole) {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 403 });
  }

  const body = await req.json();
  const {
    studentId,
    teacherId: rawTeacherId,
    recipientId,
    content,
    parentId,
  } = body;

  let finalTeacherId: string | undefined = rawTeacherId;
  if (recipientId && !rawTeacherId) {
    finalTeacherId = recipientId;
  }

  if (parentId) {
    const parent = await prisma.question.findUnique({
      where: { id: parentId },
      include: { root: true },
    });

    if (!parent) {
      return NextResponse.json({ error: 'Pergunta pai não encontrada' }, { status: 404 });
    }

    const root = parent.root || parent;

    const child = await prisma.question.create({
      data: {
        content,
        senderRole,
        answeredById: session.user.id,
        parentId: root.id,
        studentId: root.studentId,
        teacherId: root.teacherId,
      },
      include: includePayload,
    });

    return NextResponse.json(child);
  }

  let finalStudentId: string | undefined = studentId;

  if (senderRole === 'STUDENT') {
    if (!finalStudentId) {
      const student = await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 400 });
      }
      finalStudentId = student.id;
    }
    if (!finalTeacherId) {
      return NextResponse.json({ error: 'Professor destinatário é obrigatório' }, { status: 400 });
    }
  } else if (senderRole === 'TEACHER') {
    finalTeacherId = finalTeacherId || session.user.id;
    if (!finalStudentId) {
      return NextResponse.json({ error: 'Aluno é obrigatório' }, { status: 400 });
    }
  } else if (senderRole === 'GESTOR') {
    if (!finalStudentId || !finalTeacherId) {
      return NextResponse.json({ error: 'Aluno e professor são obrigatórios' }, { status: 400 });
    }
  }

  const created = await prisma.question.create({
    data: {
      content,
      senderRole,
      answeredById: session.user.id,
      studentId: finalStudentId,
      teacherId: finalTeacherId,
    },
    include: includePayload,
  });

  return NextResponse.json(created);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const senderRole = deriveSenderRole((session.user as any)?.role);
  if (!senderRole) {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 403 });
  }

  const { id, answer, content } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
  }

  const parent = await prisma.question.findUnique({
    where: { id },
    include: { root: true },
  });

  if (!parent) {
    return NextResponse.json({ error: 'Pergunta não encontrada' }, { status: 404 });
  }

  const root = parent.root || parent;
  const replyContent = (answer || content || '').trim();
  if (!replyContent) {
    return NextResponse.json({ error: 'Conteúdo da resposta é obrigatório' }, { status: 400 });
  }

  const child = await prisma.question.create({
    data: {
      content: replyContent,
      senderRole,
      answeredById: session.user.id,
      parentId: root.id,
      studentId: root.studentId,
      teacherId: root.teacherId,
    },
    include: includePayload,
  });

  return NextResponse.json(child);
}
