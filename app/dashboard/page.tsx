import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

  const students = await prisma.student.findMany({
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const myStudentIds = isTeacher
    ? students.filter((s) => s.userId === userId).map((s) => s.id)
    : students.map((s) => s.id);

  const pendingWorkouts = await prisma.workout.findMany({
    where: {
      status: 'PENDENTE',
      ...(isTeacher ? { studentId: { in: myStudentIds } } : {}),
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
    orderBy: { createdAt: 'desc' },
    take: 5,
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
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const pendingNotices = await prisma.notice.findMany({
    where: {
      OR: [
        { targetRole: 'TEACHER' },
        ...(isTeacher ? [] : [{ targetRole: 'STUDENT' }]),
      ],
      ...(isGestor
        ? {}
        : {
            NOT: {
              reads: {
                some: {
                  userId,
                },
              },
            },
          }),
    },
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      createdAt: true,
      author: {
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
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const managementNotices = await prisma.notice.findMany({
    where: {
      authorId: userId,
    },
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const managementMessages = await prisma.question.findMany({
    where: {
      senderRole: 'GESTOR',
    },
    include: {
      student: true,
      teacher: true,
      answeredBy: true,
      children: {
        orderBy: { createdAt: 'asc' },
        include: {
          answeredBy: true,
          student: true,
          teacher: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-[#f5f5f5]">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Treinos Pendentes */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Treinos Pendentes
            </h2>
            <div className="space-y-3">
              {pendingWorkouts.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">
                  Nenhum treino pendente.
                </p>
              )}
              {pendingWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                >
                  <p className="text-sm font-medium text-[#f5f5f5]">
                    {w.student?.name || 'Aluno'}
                  </p>
                  <p className="text-sm text-[#a1a1a1]">Treino pendente</p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    {formatDate(w.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Perguntas sem Resposta */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Perguntas sem Resposta
            </h2>
            <div className="space-y-3">
              {unansweredQuestions.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">
                  Nenhuma pergunta pendente.
                </p>
              )}
              {unansweredQuestions.map((q) => (
                <div
                  key={q.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                >
                  <p className="text-sm font-medium text-[#f5f5f5] line-clamp-2">
                    {q.content}
                  </p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    {q.student?.name || 'Aluno'} • {formatDate(q.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Avisos Pendentes */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Avisos Pendentes
            </h2>
            <div className="space-y-3">
              {pendingNotices.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">
                  Nenhum aviso pendente.
                </p>
              )}
              {pendingNotices.map((n) => (
                <div
                  key={n.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                >
                  <p className="text-sm font-medium text-[#f5f5f5]">
                    {n.title || 'Aviso'}
                  </p>
                  <p className="text-sm text-[#a1a1a1] line-clamp-2">
                    {n.content}
                  </p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    {formatDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Avisos da Gestão */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Avisos da Gestão
            </h2>
            <div className="space-y-3">
              {managementNotices.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">
                  Nenhum aviso publicado.
                </p>
              )}
              {managementNotices.map((n) => (
                <div
                  key={n.id}
                  className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                >
                  <p className="text-sm font-medium text-[#f5f5f5]">
                    {n.title || 'Aviso'}
                  </p>
                  <p className="text-sm text-[#a1a1a1] line-clamp-2">
                    {n.content}
                  </p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    {formatDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Mensagens da Gestão */}
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-5 md:col-span-2 lg:col-span-2">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Mensagens da Gestão
            </h2>
            <div className="space-y-3">
              {managementMessages.length === 0 && (
                <p className="text-sm text-[#a1a1a1]">
                  Nenhuma mensagem da gestão.
                </p>
              )}
              {managementMessages.map((msg) => {
                const replies = (msg.children || []).filter(
                  (c) => c.senderRole === 'TEACHER'
                );
                const lastReply = replies[replies.length - 1];

                return (
                  <div
                    key={msg.id}
                    className="bg-[#0a0a0a] border border-[#ffffff10] rounded-lg p-3"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5] line-clamp-2">
                      {msg.content}
                    </p>
                    {lastReply ? (
                      <div className="mt-2 text-sm text-[#a1a1a1]">
                        <p className="font-medium text-[#D4A373]">
                          Última resposta:
                        </p>
                        <p className="line-clamp-2">{lastReply.content}</p>
                        <p className="text-xs mt-1">
                          {lastReply.answeredBy?.name || 'Professor'} •{' '}
                          {formatDate(lastReply.createdAt)}
                        </p>
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
                    ) : (
                      <p className="text-xs text-[#a1a1a1] mt-2">
                        Aguardando resposta do professor.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
