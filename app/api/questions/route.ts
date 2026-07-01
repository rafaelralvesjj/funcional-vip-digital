import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

type SenderRole = 'GESTOR' | 'TEACHER' | 'STUDENT';

function deriveSenderRole(role: unknown): 'GESTOR' | 'TEACHER' | 'STUDENT' | null {
  if (typeof role !== 'string') return null;
  const upper = role.toUpperCase();
  if (upper === 'GESTOR') return 'GESTOR';
  if (upper === 'TEACHER' || upper === 'PROFESSOR') return 'TEACHER';
  if (upper === 'STUDENT' || upper === 'ALUNO') return 'STUDENT';
  return null;
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
      children: {
        include: {
          student: true,
          teacher: true,
          answeredBy: true,
        },
      },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || undefined;
    const teacherId = searchParams.get('teacherId') || undefined;
    const parentId = searchParams.get('parentId') || undefined;
    const senderRole = searchParams.get('senderRole') || undefined;

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (parentId) where.parentId = parentId;
    if (senderRole) where.senderRole = senderRole;

    const questions = await prisma.question.findMany({
      where,
      include: includePayload,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error('GET /api/questions error:', error);
    return NextResponse.json({ message: 'Erro ao buscar mensagens' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));

    const text: string = typeof body.content === 'string' ? body.content.trim() : '';
    if (!text) {
      return NextResponse.json({ message: 'Conteúdo da mensagem é obrigatório' }, { status: 400 });
    }

    const senderRole = deriveSenderRole(body.senderRole);
    if (!senderRole) {
      return NextResponse.json({ message: 'Papel do remetente inválido' }, { status: 400 });
    }

    const finalStudentId: string | null =
      typeof body.studentId === 'string' && body.studentId.trim() !== '' ? body.studentId.trim() : null;
    const finalTeacherId: string | null =
      typeof body.teacherId === 'string' && body.teacherId.trim() !== '' ? body.teacherId.trim() : null;

    const parentId: string | null =
      typeof body.parentId === 'string' && body.parentId.trim() !== '' ? body.parentId.trim() : null;

    if (senderRole === 'GESTOR') {
      if (!finalStudentId && !finalTeacherId) {
        return NextResponse.json(
          { message: 'Informe um aluno ou professor destinatário' },
          { status: 400 }
        );
      }
      const created = await prisma.question.create({
        data: {
          studentId: finalStudentId || "",
          teacherId: finalTeacherId || "",
          content: text,
          senderRole: senderRole as any,
          answeredById: userId,
          ...(parentId ? { parentId } : {}),
        },
        include: includePayload,
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (senderRole === 'STUDENT') {
      if (!finalTeacherId) {
        return NextResponse.json(
          { message: 'Professor é obrigatório' },
          { status: 400 }
        );
      }
      const created = await prisma.question.create({
        data: {
          studentId: finalStudentId || "",
          teacherId: finalTeacherId || "",
          content: text,
          senderRole: senderRole as any,
          ...(parentId ? { parentId } : {}),
        },
        include: includePayload,
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (senderRole === 'TEACHER') {
      if (!finalStudentId) {
        return NextResponse.json(
          { message: 'Aluno é obrigatório' },
          { status: 400 }
        );
      }
      const created = await prisma.question.create({
        data: {
          studentId: finalStudentId || "",
          teacherId: finalTeacherId || "",
          content: text,
          senderRole: senderRole as any,
          answeredById: userId,
          ...(parentId ? { parentId } : {}),
        },
        include: includePayload,
      });
      return NextResponse.json(created, { status: 201 });
    }

    return NextResponse.json({ message: 'Papel do remetente não suportado' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/questions error:', error);
    return NextResponse.json({ message: 'Erro ao criar mensagem' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id: string = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ message: 'ID da mensagem é obrigatório' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.content === 'string' && body.content.trim() !== '') {
      data.content = body.content.trim();
    }
    if (typeof body.studentId === 'string') {
      data.studentId = body.studentId.trim() || "";
    }
    if (typeof body.teacherId === 'string') {
      data.teacherId = body.teacherId.trim() || "";
    }
    if (typeof body.answeredById === 'string' && body.answeredById.trim() !== '') {
      data.answeredById = body.answeredById.trim();
    }

    const updated = await prisma.question.update({
      where: { id },
      data,
      include: includePayload,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/questions error:', error);
    return NextResponse.json({ message: 'Erro ao atualizar mensagem' }, { status: 500 });
  }
}
