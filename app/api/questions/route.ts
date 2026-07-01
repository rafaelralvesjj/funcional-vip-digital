import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

function deriveSenderRole(role: unknown): 'GESTOR' | 'TEACHER' | 'STUDENT' | null {
  if (role === 'GESTOR' || role === 'TEACHER' || role === 'STUDENT') {
    return role;
  }
  return null;
}

const includePayload = {
  student: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
  answeredBy: { select: { id: true, name: true, role: true } },
};

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden(message: string = 'Invalid role') {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return unauthorized();
  }

  const role = (session.user as any)?.role;
  const senderRole = deriveSenderRole(role);
  if (!senderRole) {
    return forbidden();
  }

  const { searchParams } = request.nextUrl;
  const studentIdParam = searchParams.get('studentId') || undefined;
  const teacherIdParam = searchParams.get('teacherId') || undefined;
  const senderRoleParam = searchParams.get('senderRole') || undefined;
  const answeredByIdParam = searchParams.get('answeredById') || undefined;
  const directionParam = searchParams.get('direction') || undefined;

  const baseWhere: any = { parentId: null };

  if (senderRole === 'GESTOR') {
    baseWhere.senderRole = senderRoleParam || 'GESTOR';
    if (studentIdParam) baseWhere.studentId = studentIdParam;
    if (teacherIdParam) baseWhere.teacherId = teacherIdParam;
  } else if (senderRole === 'TEACHER') {
    baseWhere.teacherId = session.user.id;
    if (studentIdParam) baseWhere.studentId = studentIdParam;
    if (senderRoleParam) baseWhere.senderRole = senderRoleParam;
  } else if (senderRole === 'STUDENT') {
    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    baseWhere.studentId = student.id;
    if (teacherIdParam) baseWhere.teacherId = teacherIdParam;
    if (senderRoleParam) baseWhere.senderRole = senderRoleParam;
  }

  if (answeredByIdParam) baseWhere.answeredById = answeredByIdParam;
  if (directionParam) baseWhere.direction = directionParam;

  const questions = await prisma.question.findMany({
    where: baseWhere,
    include: {
      ...includePayload,
      children: {
        orderBy: { createdAt: 'asc' },
        include: {
          answeredBy: { select: { id: true, name: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return unauthorized();
  }

  const role = (session.user as any)?.role;
  const senderRole = deriveSenderRole(role);
  if (!senderRole) {
    return forbidden();
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { studentId, teacherId, recipientId, content, parentId } = body;

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return badRequest('content is required');
  }

  const finalText = content.trim();

  if (parentId) {
    const parent = await prisma.question.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return NextResponse.json({ error: 'Parent question not found' }, { status: 404 });
    }

    const rootId = parent.parentId || parent.id;
    const root = await prisma.question.findUnique({
      where: { id: rootId },
    });
    if (!root) {
      return NextResponse.json({ error: 'Root question not found' }, { status: 404 });
    }

    const child = await prisma.question.create({
      data: {
        parentId: root.id,
        studentId: root.studentId,
        teacherId: root.teacherId,
        content: finalText,
        senderRole,
        answeredById: session.user.id,
      },
      include: includePayload,
    });

    return NextResponse.json(child, { status: 201 });
  }

  const finalTeacherId = teacherId || recipientId;
  let resolvedStudentId: string | undefined;
  let resolvedTeacherId: string | undefined;

  if (senderRole === 'STUDENT') {
    if (!studentId) {
      const student = await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      resolvedStudentId = student.id;
    } else {
      resolvedStudentId = studentId;
    }
    if (!finalTeacherId) {
      return badRequest('teacherId is required');
    }
    resolvedTeacherId = finalTeacherId;
  } else if (senderRole === 'TEACHER') {
    resolvedTeacherId = finalTeacherId || session.user.id;
    if (!studentId) {
      return badRequest('studentId is required');
    }
    resolvedStudentId = studentId;
  } else if (senderRole === 'GESTOR') {
    if (!studentId || !finalTeacherId) {
      return badRequest('studentId and teacherId are required');
    }
    resolvedStudentId = studentId;
    resolvedTeacherId = finalTeacherId;
  }

  const question = await prisma.question.create({
    data: {
      studentId: resolvedStudentId!,
      teacherId: resolvedTeacherId!,
      content: finalText,
      senderRole,
      answeredById: session.user.id,
    },
    include: includePayload,
  });

  return NextResponse.json(question, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return unauthorized();
  }

  const role = (session.user as any)?.role;
  const senderRole = deriveSenderRole(role);
  if (!senderRole) {
    return forbidden();
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { id, answer, content } = body;

  if (!id) {
    return badRequest('id is required');
  }

  const text = answer || content;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return badRequest('answer or content is required');
  }

  const target = await prisma.question.findUnique({
    where: { id },
  });
  if (!target) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const rootId = target.parentId || target.id;
  const root = await prisma.question.findUnique({
    where: { id: rootId },
  });
  if (!root) {
    return NextResponse.json({ error: 'Root question not found' }, { status: 404 });
  }

  const child = await prisma.question.create({
    data: {
      parentId: root.id,
      studentId: root.studentId,
      teacherId: root.teacherId,
      content: text.trim(),
      senderRole,
      answeredById: session.user.id,
    },
    include: includePayload,
  });

  return NextResponse.json(child);
}
