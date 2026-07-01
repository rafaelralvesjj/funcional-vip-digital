import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const role = (session.user as any)?.role;
  const isGestor = role === 'GESTOR';

  const students = await prisma.student.findMany({
    where: isGestor ? {} : { userId },
    select: {
      id: true,
      name: true,
      user: { select: { id: true, name: true } },
    },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const myStudentIds = students.map((s) => s.id);

  const pendingWorkouts = await prisma.workout.findMany({
    where: {
      status: 'PENDENTE',
      studentId: { in: myStudentIds },
    },
    select: {
      id: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
    },
  });

  const unansweredQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      studentId: { in: myStudentIds },
      NOT: {
        children: {
          some: {
            senderRole: 'TEACHER',
          },
        },
      },
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
    },
  });

  const pendingNotices = await prisma.notice.findMany({
    where: isGestor
      ? { targetRole: 'ALUNO' }
      : { targetRole: 'ALUNO', authorId: userId },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      studentId: true,
      reads: { select: { studentId: true } },
    },
  });

  const managementNotices = await prisma.notice.findMany({
    where: isGestor
      ? { authorId: userId, targetRole: 'PROFESSOR' }
      : {
          targetRole: 'PROFESSOR',
          OR: [{ professorId: userId }, { professorId: null }],
        },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
    },
  });

  const managementMessages = await prisma.question.findMany({
    where: isGestor
      ? { senderRole: 'GESTOR', parentId: null }
      : { teacherId: userId, senderRole: 'GESTOR', parentId: null },
    include: {
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      answeredBy: { select: { id: true, name: true } },
      children: {
        orderBy: { createdAt: 'asc' },
        include: {
          answeredBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-[#f5f5f5]">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Treinos Pendentes
            </h2>
            <div className="space-y-3">
              {pendingWorkouts.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">
                  Nenhum treino pendente.
                </p>
              ) : (
                pendingWorkouts.map((workout) => (
                  <div
                    key={workout.id}
                    className="border-b border-[#ffffff10] pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-[#f5f5f5] font-medium">Treino pendente</p>
                    <p className="text-[#a1a1a1] text-sm">
                      {workout.student?.name ?? 'Aluno'}
                    </p>
                    <p className="text-[#a1a1a1] text-xs">
                      {formatDate(workout.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Perguntas sem Resposta
            </h2>
            <div className="space-y-3">
              {unansweredQuestions.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">
                  Nenhuma pergunta sem resposta.
                </p>
              ) : (
                unansweredQuestions.map((question) => (
                  <div
                    key={question.id}
                    className="border-b border-[#ffffff10] pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-[#f5f5f5] font-medium line-clamp-2">
                      {question.content}
                    </p>
                    <p className="text-[#a1a1a1] text-sm">
                      {question.student?.name ?? 'Aluno'}
                    </p>
                    <p className="text-[#a1a1a1] text-xs">
                      {formatDate(question.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Avisos Pendentes
            </h2>
            <div className="space-y-3">
              {pendingNotices.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">
                  Nenhum aviso pendente.
                </p>
              ) : (
                pendingNotices.map((notice) => {
                  const targetStudent = notice.studentId
                    ? studentMap.get(notice.studentId)
                    : null;
                  return (
                    <div
                      key={notice.id}
                      className="border-b border-[#ffffff10] pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-[#f5f5f5] font-medium">{notice.title}</p>
                      <p className="text-[#a1a1a1] text-sm line-clamp-2">
                        {notice.content}
                      </p>
                      {notice.studentId && (
                        <p className="text-[#a1a1a1] text-xs">
                          Para: {targetStudent?.name ?? 'Aluno'}
                        </p>
                      )}
                      <p className="text-[#a1a1a1] text-xs">
                        {formatDate(notice.createdAt)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-lg p-5">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Avisos da Gestão
            </h2>
            <div className="space-y-3">
              {managementNotices.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">
                  Nenhum aviso da gestão.
                </p>
              ) : (
                managementNotices.map((notice) => (
                  <div
                    key={notice.id}
                    className="border-b border-[#ffffff10] pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-[#f5f5f5] font-medium">{notice.title}</p>
                    <p className="text-[#a1a1a1] text-sm line-clamp-2">
                      {notice.content}
                    </p>
                    <p className="text-[#a1a1a1] text-xs">
                      {formatDate(notice.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-lg p-5 md:col-span-2 lg:col-span-2">
            <h2 className="text-lg font-semibold text-[#D4A373] mb-4">
              Mensagens da Gestão
            </h2>
            <div className="space-y-3">
              {managementMessages.length === 0 ? (
                <p className="text-[#a1a1a1] text-sm">
                  Nenhuma mensagem da gestão.
                </p>
              ) : (
                managementMessages.map((msg) => {
                  const replies = (msg.children || []).filter(
                    (c) => c.senderRole === 'TEACHER'
                  );
                  const lastReply = replies[replies.length - 1];
                  return (
                    <div
                      key={msg.id}
                      className="border-b border-[#ffffff10] pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-[#f5f5f5] font-medium">
                        {msg.content}
                      </p>
                      <p className="text-[#a1a1a1] text-sm">
                        Para: {msg.student?.name ?? msg.teacher?.name ?? '—'}
                      </p>
                      {lastReply ? (
                        <div className="mt-2">
                          <p className="text-[#a1a1a1] text-sm">
                            {lastReply.content}
                          </p>
                          <p className="text-[#D4A373] text-xs">
                            Respondido por: {lastReply.answeredBy?.name ?? '—'}
                          </p>
                        </div>
                      ) : !isGestor ? (
                        <div className="mt-2">
                          <GestaoMessageReply
                            questionId={msg.id}
                            studentId={String(msg.studentId ?? '')}
                            teacherId={userId}
                            currentUserId={userId}
                          />
                        </div>
                      ) : (
                        <p className="text-[#a1a1a1] text-xs mt-2">
                          Aguardando resposta
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
