import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const role = (session.user as any)?.role?.toUpperCase?.() || '';
  const isTeacher = role === 'TEACHER' || role === 'PROFESSOR';
  const isGestor = role === 'GESTOR' || role === 'ADMIN';
  const userName = (session.user as any)?.name || 'Usuário';

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const students = await prisma.student.findMany({
    where: isTeacher ? { userId } : {},
    select: {
      id: true,
      name: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const myStudentIds = students.map((s) => s.id);

  const pendingWorkouts = await prisma.workout.findMany({
    where: {
      status: 'PENDENTE',
      ...(isTeacher && myStudentIds.length > 0
        ? { studentId: { in: myStudentIds } }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const unansweredQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      ...(isTeacher && myStudentIds.length > 0
        ? { studentId: { in: myStudentIds } }
        : {}),
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
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
        },
      },
      children: {
        select: {
          id: true,
          senderRole: true,
          content: true,
          createdAt: true,
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

  const notices = await prisma.notice.findMany({
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      createdAt: true,
      authorId: true,
      targetRole: true,
      studentId: true,
      professorId: true,
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
        },
      },
      professor: {
        select: {
          id: true,
          name: true,
        },
      },
      reads: {
        select: {
          studentId: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const pendingNotices = notices.filter((n) => {
    if (!n.targetRole) return false;
    const target = n.targetRole.toUpperCase();
    if (target === 'STUDENT') {
      if (isTeacher || isGestor) return false;
      if (n.studentId) return n.studentId !== userId && !n.reads.some((r) => r.studentId === userId);
      return !n.reads.some((r) => r.studentId === userId);
    }
    if (target === 'TEACHER') {
      if (!isTeacher) return false;
      if (n.professorId) return n.professorId !== userId;
      return true;
    }
    if (target === 'GESTOR' || target === 'ADMIN') {
      return isGestor;
    }
    return false;
  });

  const managementNotices = notices.filter((n) => {
    const authorRole = (n.author?.role || '').toUpperCase();
    const type = (n.type || '').toUpperCase();
    return authorRole === 'GESTOR' || authorRole === 'ADMIN' || type === 'MANAGEMENT';
  });

  const managementMessages = await prisma.question.findMany({
    where: {
      senderRole: 'GESTOR',
      parentId: null,
      ...(isTeacher ? { teacherId: userId } : {}),
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
          createdAt: 'asc',
        },
        include: {
          answeredBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
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
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const questionsWithoutAnswer = unansweredQuestions.filter((q) => {
    return !q.children.some((c) => c.senderRole === 'TEACHER');
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#f5f5f5]">
            Olá, {userName}
          </h1>
          <p className="mt-2 text-[#a1a1a1]">
            Bem-vindo ao painel administrativo. Aqui está o resumo das atividades pendentes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
            <p className="text-[#a1a1a1] text-sm">Meus alunos</p>
            <p className="text-3xl font-semibold text-[#D4A373] mt-2">{students.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
            <p className="text-[#a1a1a1] text-sm">Treinos pendentes</p>
            <p className="text-3xl font-semibold text-[#D4A373] mt-2">{pendingWorkouts.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
            <p className="text-[#a1a1a1] text-sm">Dúvidas sem resposta</p>
            <p className="text-3xl font-semibold text-[#D4A373] mt-2">{questionsWithoutAnswer.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
            <p className="text-[#a1a1a1] text-sm">Avisos pendentes</p>
            <p className="text-3xl font-semibold text-[#D4A373] mt-2">{pendingNotices.length}</p>
          </div>
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Alunos com treinos pendentes</h2>
          {pendingWorkouts.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhum treino pendente no momento.</p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {pendingWorkouts.map((w) => (
                <div key={w.id} className="py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[#f5f5f5] font-medium">{w.student?.name || 'Aluno'}</p>
                    <p className="text-[#a1a1a1] text-sm">{formatDate(w.createdAt)}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs bg-[#D4A373]/10 text-[#D4A373]">
                    Pendente
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Dúvidas sem resposta</h2>
          {questionsWithoutAnswer.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhuma dúvida aguardando resposta.</p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {questionsWithoutAnswer.map((q) => (
                <div key={q.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[#f5f5f5] font-medium">{q.student?.name || 'Aluno'}</p>
                    <p className="text-[#a1a1a1] text-sm">{formatDate(q.createdAt)}</p>
                  </div>
                  <p className="text-[#a1a1a1] mt-2 line-clamp-2">{q.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Avisos com leitura pendente</h2>
          {pendingNotices.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhum aviso pendente de leitura.</p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {pendingNotices.map((n) => (
                <div key={n.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[#f5f5f5] font-medium">
                      {n.title || 'Aviso'}
                    </p>
                    <p className="text-[#a1a1a1] text-sm">{formatDate(n.createdAt)}</p>
                  </div>
                  <p className="text-[#a1a1a1] mt-2">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Avisos da gestão</h2>
          {managementNotices.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhum aviso da gestão.</p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {managementNotices.map((n) => (
                <div key={n.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[#f5f5f5] font-medium">{n.title || 'Aviso da Gestão'}</p>
                    <p className="text-[#a1a1a1] text-sm">{formatDate(n.createdAt)}</p>
                  </div>
                  <p className="text-[#a1a1a1] mt-2">{n.content}</p>
                  <p className="text-[#D4A373] text-sm mt-2">
                    Por: {n.author?.name || 'Gestão'} {n.author?.role ? `(${n.author.role})` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Mensagens da gestão</h2>
          {managementMessages.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhuma mensagem da gestão.</p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {managementMessages.map((msg) => {
                const replies = (msg.children || []).filter((c) => c.senderRole === 'TEACHER');
                const lastReply = replies[replies.length - 1];
                return (
                  <div key={msg.id} className="py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[#f5f5f5] font-medium">
                        {msg.student?.name || 'Aluno'} {msg.teacher?.name ? `→ ${msg.teacher.name}` : ''}
                      </p>
                      <p className="text-[#a1a1a1] text-sm">{formatDate(msg.createdAt)}</p>
                    </div>
                    <p className="text-[#a1a1a1] mt-2">{msg.content}</p>
                    {lastReply ? (
                      <div className="mt-3 p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]">
                        <p className="text-[#a1a1a1] text-sm">
                          Última resposta de {lastReply.answeredBy?.name || 'Professor'}:
                        </p>
                        <p className="text-[#f5f5f5] mt-1">{lastReply.content}</p>
                      </div>
                    ) : !isGestor ? (
                      <div className="mt-3">
                        <GestaoMessageReply
                          questionId={msg.id}
                          studentId={String(msg.studentId ?? '')}
                          teacherId={userId}
                          currentUserId={userId}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">Meus alunos</h2>
          {students.length === 0 ? (
            <p className="text-[#a1a1a1]">Nenhum aluno vinculado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl bg-[#0a0a0a] border border-[#ffffff10]"
                >
                  <p className="text-[#f5f5f5] font-medium">{s.name}</p>
                  <p className="text-[#a1a1a1] text-sm">
                    Usuário: {s.user?.name || 'Não vinculado'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
