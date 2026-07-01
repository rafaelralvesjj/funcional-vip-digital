import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/auth';

const baseInclude = {
  student: { select: { id: true, name: true } },
  answeredBy: { select: { id: true, name: true, role: true } },
  teacher: { select: { id: true, name: true } },
};

const rootInclude = {
  ...baseInclude,
  children: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      answeredBy: { select: { id: true, name: true, role: true } },
    },
  },
};

function deriveSenderRole(role: any): 'GESTOR' | 'TEACHER' | 'STUDENT' | null {
  if (role === 'GESTOR') return 'GESTOR';
  if (role === 'TEACHER') return 'TEACHER';
  if (role === 'STUDENT') return 'STUDENT';
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const role = (session.user as any)?.role;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || undefined;
    const teacherId = searchParams.get('teacherId') || undefined;
    const senderRole = searchParams.get('senderRole') || undefined;
    const answeredById = searchParams.get('answeredById') || undefined;
    // direction é recebido para compatibilidade, mas não altera o filtro de raízes
    searchParams.get('direction');

    const where: any = { parentId: null };

    if (role === 'GESTOR') {
      where.senderRole = senderRole || 'GESTOR';
      if (teacherId) where.teacherId = teacherId;
      if (studentId) where.studentId = studentId;
      if (answeredById) where.answeredById = answeredById;
    } else if (role === 'TEACHER') {
      where.teacherId = session.user.id;
      if (studentId) where.studentId = studentId;
      if (senderRole) where.senderRole = senderRole;
      if (answeredById) where.answeredById = answeredById;
    } else if (role === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado para este usuário' },
          { status: 404 }
        );
      }
      where.studentId = student.id;
      if (teacherId) where.teacherId = teacherId;
      if (senderRole) where.senderRole = senderRole;
      if (answeredById) where.answeredById = answeredById;
    } else {
      return NextResponse.json({ error: 'Perfil não reconhecido' }, { status: 403 });
    }

    const questions = await prisma.question.findMany({
      where,
      include: rootInclude,
      orderBy: { createdAt: 'desc' as const },
      take: 100,
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error('Erro em GET /api/questions:', error);
    return NextResponse.json(
      { error: 'Erro ao listar mensagens' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const role = (session.user as any)?.role;

    const body = await req.json();
    let {
      studentId,
      teacherId,
      recipientId,
      content,
      parentId,
    } = body;

    const finalSenderRole = deriveSenderRole(role);
    if (!finalSenderRole) {
      return NextResponse.json(
        { error: 'Perfil não autorizado a enviar mensagens' },
        { status: 403 }
      );
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { error: 'Conteúdo é obrigatório' },
        { status: 400 }
      );
    }

    if (recipientId && !teacherId) {
      teacherId = recipientId;
    }

    let question;

    if (parentId) {
      const parent = await prisma.question.findUnique({
        where: { id: parentId },
        select: { id: true, parentId: true, studentId: true, teacherId: true },
      });
      if (!parent) {
        return NextResponse.json(
          { error: 'Mensagem pai não encontrada' },
          { status: 404 }
        );
      }

      const rootId = parent.parentId || parent.id;
      const root = await prisma.question.findUnique({
        where: { id: rootId },
        select: { id: true, studentId: true, teacherId: true },
      });
      if (!root) {
        return NextResponse.json(
          { error: 'Thread raiz não encontrada' },
          { status: 404 }
        );
      }
      if (!root.studentId || !root.teacherId) {
        return NextResponse.json(
          { error: 'Thread raiz incompleta' },
          { status: 400 }
        );
      }

      question = await prisma.question.create({
        data: {
          parentId: root.id,
          studentId: root.studentId,
          teacherId: root.teacherId,
          content: content.trim(),
          senderRole: finalSenderRole,
          answeredById: session.user.id,
        },
        include: baseInclude,
      });
    } else {
      if (role === 'STUDENT') {
        if (!studentId || !teacherId) {
          return NextResponse.json(
            { error: 'studentId e teacherId são obrigatórios para criar thread' },
            { status: 400 }
          );
        }
      } else if (role === 'GESTOR' || role === 'TEACHER') {
        if (!teacherId || !studentId) {
          return NextResponse.json(
            { error: 'teacherId e studentId são obrigatórios para criar thread' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Perfil não autorizado' },
          { status: 403 }
        );
      }

      question = await prisma.question.create({
        data: {
          parentId: null,
          studentId,
          teacherId,
          content: content.trim(),
          senderRole: finalSenderRole,
          answeredById: session.user.id,
        },
        include: baseInclude,
      });
    }

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error('Erro em POST /api/questions:', error);
    return NextResponse.json(
      { error: 'Erro ao criar mensagem' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const role = (session.user as any)?.role;

    const body = await req.json();
    const { id, answer, content } = body;

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    }

    const text = ((answer || content) ?? '').toString().trim();
    if (!text) {
      return NextResponse.json(
        { error: 'Texto da resposta é obrigatório' },
        { status: 400 }
      );
    }

    const finalSenderRole = deriveSenderRole(role);
    if (!finalSenderRole) {
      return NextResponse.json(
        { error: 'Perfil não autorizado a responder' },
        { status: 403 }
      );
    }

    const target = await prisma.question.findUnique({
      where: { id },
      select: { id: true, parentId: true, studentId: true, teacherId: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'Mensagem não encontrada' },
        { status: 404 }
      );
    }

    const rootId = target.parentId || target.id;
    const root = await prisma.question.findUnique({
      where: { id: rootId },
      select: { id: true, studentId: true, teacherId: true },
    });
    if (!root) {
      return NextResponse.json(
        { error: 'Thread raiz não encontrada' },
        { status: 404 }
      );
    }
    if (!root.studentId || !root.teacherId) {
      return NextResponse.json(
        { error: 'Thread raiz incompleta' },
        { status: 400 }
      );
    }

    const child = await prisma.question.create({
      data: {
        parentId: root.id,
        studentId: root.studentId,
        teacherId: root.teacherId,
        content: text,
        senderRole: finalSenderRole,
        answeredById: session.user.id,
      },
      include: baseInclude,
    });

    return NextResponse.json(child);
  } catch (error) {
    console.error('Erro em PUT /api/questions:', error);
    return NextResponse.json(
      { error: 'Erro ao responder mensagem' },
      { status: 500 }
    );
  }
}
