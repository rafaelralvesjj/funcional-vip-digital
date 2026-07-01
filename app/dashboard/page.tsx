import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

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

  const myStudentIds = isTeacher ? students.map((s) => s.id) : [];

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

  const questionsRaw = await prisma.question.findMany({
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

  const unansweredQuestions = questionsRaw.filter(
    (q) => !q.children.some((c) => c.senderRole === 'TEACHER')
  );

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

  const pendingNotices = notices.filter(
    (n) => !n.reads.some((r) => r.studentId === userId)
  );
  const managementNotices = notices.filter(
    (n) => n.type === 'MANAGEMENT' || n.author?.role === 'GESTOR' || n.author?.role === 'ADMIN'
  );

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

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-[#a1a1a1]">
            Bem-vindo(a), {userName}. Aqui está o resumo da sua área.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5">
            <p className="text-[#a1a1a1] text-sm">Meus alunos</p>
            <p className="text-2xl font-semibold text-[#f5f5f5] mt-1">{students.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5">
            <p className="text-[#a1a1a1] text-sm">Treinos pendentes</p>
            <p className="text-2xl font-semibold text-[#D4A373] mt-1">{pendingWorkouts.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5">
            <p className="text-[#a1a1a1] text-sm">Dúvidas sem resposta</p>
            <p className="text-2xl font-semibold text-[#D4A373] mt-1">{unansweredQuestions.length}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5">
            <p className="text-[#a1a1a1] text-sm">Avisos pendentes</p>
            <p className="text-2xl font-semibold text-[#D4A373] mt-1">{pendingNotices.length}</p>
          </div>
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Alunos com treinos pendentes</h2>
          {pendingWorkouts.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Nenhum treino pendente no momento.</p>
          ) : (
            <ul className="space-y-3">
              {pendingWorkouts.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                >
                  <div>
                    <p className="font-medium text-[#f5f5f5]">{w.student?.name || 'Aluno'}</p>
                    <p className="text-xs text-[#a1a1a1] mt-0.5">Criado em {formatDate(w.createdAt)}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#D4A373]/10 text-[#D4A373]">
                    Pendente
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Dúvidas sem resposta</h2>
          {unansweredQuestions.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Todas as dúvidas foram respondidas.</p>
          ) : (
            <ul className="space-y-3">
              {unansweredQuestions.map((q) => (
                <li
                  key={q.id}
                  className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-[#f5f5f5]">{q.student?.name || 'Aluno'}</p>
                    <span className="text-xs text-[#a1a1a1]">{formatDate(q.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#a1a1a1] mt-2 line-clamp-2">{q.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Avisos com leitura pendente</h2>
          {pendingNotices.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Nenhum aviso pendente de leitura.</p>
          ) : (
            <ul className="space-y-3">
              {pendingNotices.map((n) => (
                <li
                  key={n.id}
                  className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-[#f5f5f5]">
                      {n.title || 'Aviso'}
                    </p>
                    <span className="text-xs text-[#a1a1a1]">{formatDate(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#a1a1a1] mt-2">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Avisos da gestão</h2>
          {managementNotices.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Nenhum aviso da gestão publicado.</p>
          ) : (
            <ul className="space-y-3">
              {managementNotices.map((n) => (
                <li
                  key={n.id}
                  className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-[#f5f5f5]">
                      {n.title || 'Aviso da Gestão'}
                    </p>
                    <span className="text-xs text-[#a1a1a1]">{formatDate(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#a1a1a1] mt-2">{n.content}</p>
                  <p className="text-xs text-[#D4A373] mt-2">
                    Por: {n.author?.name || 'Gestão'}
                    {n.student?.name ? ` • Para aluno: ${n.student.name}` : ''}
                    {n.professor?.name ? ` • Para professor: ${n.professor.name}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Mensagens da gestão</h2>
          {managementMessages.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Nenhuma mensagem da gestão.</p>
          ) : (
            <ul className="space-y-4">
              {managementMessages.map((msg) => {
                const replies = (msg.children || []).filter(
                  (c) => c.senderRole === 'TEACHER'
                );
                const lastReply = replies[replies.length - 1];

                return (
                  <li
                    key={msg.id}
                    className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-[#f5f5f5]">
                        {msg.student?.name || 'Aluno'} / {msg.teacher?.name || 'Professor'}
                      </p>
                      <span className="text-xs text-[#a1a1a1]">
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-[#a1a1a1] mt-2">{msg.content}</p>

                    {lastReply ? (
                      <div className="mt-3 p-3 rounded-lg bg-[#111111] border border-[#ffffff08]">
                        <p className="text-xs text-[#D4A373]">
                          Última resposta de {lastReply.answeredBy?.name || 'Professor'}
                        </p>
                        <p className="text-sm text-[#f5f5f5] mt-1">{lastReply.content}</p>
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Meus alunos</h2>
          {students.length === 0 ? (
            <p className="text-[#a1a1a1] text-sm">Nenhum aluno vinculado.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {students.map((s) => (
                <li
                  key={s.id}
                  className="bg-[#0a0a0a] border border-[#ffffff08] rounded-xl p-4"
                >
                  <p className="font-medium text-[#f5f5f5]">{s.name}</p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Usuário: {s.user?.name || 'Não vinculado'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
