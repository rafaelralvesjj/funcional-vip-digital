import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import GestaoMessageReply from '@/components/GestaoMessageReply';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const userId = session.user.id;
  const isGestor = session.user.role === 'GESTOR';

  const alunos = await prisma.student.findMany({
    where: isGestor ? {} : { userId },
    select: {
      id: true,
      name: true,
      user: { select: { id: true, name: true } },
    },
  });
  const myStudentIds = alunos.map((a) => a.id);

  const pendingWorkouts = await prisma.workout.findMany({
    where: { status: 'PENDENTE', studentId: { in: myStudentIds } },
    include: {
      student: { include: { user: { select: { name: true } } } },
    },
  });
  const totalPendingWorkouts = pendingWorkouts.length;

  const rawQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      studentId: { in: myStudentIds },
    },
    include: {
      student: { include: { user: { select: { name: true } } } },
      children: { select: { senderRole: true } },
    },
  });
  const unansweredQuestions = rawQuestions.filter(
    (q) => !q.children.some((c) => c.senderRole === 'TEACHER')
  );
  const totalUnansweredQuestions = unansweredQuestions.length;

  const notices = await prisma.notice.findMany({
    where: isGestor
      ? { targetRole: 'ALUNO' }
      : { targetRole: 'ALUNO', authorId: userId },
    include: {
      author: { select: { name: true } },
      student: { include: { user: { select: { name: true } } } },
      reads: { select: { studentId: true } },
    },
  });

  type StudentItem = typeof alunos[number];
  type NoticeItem = typeof notices[number];

  const pendingNoticesByStudent = new Map<
    string,
    { student: StudentItem; notices: NoticeItem[] }
  >();

  function addPending(student: StudentItem, notice: NoticeItem) {
    const entry = pendingNoticesByStudent.get(student.id);
    if (entry) {
      entry.notices.push(notice);
    } else {
      pendingNoticesByStudent.set(student.id, { student, notices: [notice] });
    }
  }

  for (const notice of notices) {
    const readStudentIds = notice.reads.map((r) => r.studentId);
    if (notice.studentId) {
      if (
        myStudentIds.includes(notice.studentId) &&
        !readStudentIds.includes(notice.studentId)
      ) {
        const aluno = alunos.find((a) => a.id === notice.studentId);
        if (aluno) addPending(aluno, notice);
      }
    } else {
      for (const aluno of alunos) {
        if (!readStudentIds.includes(aluno.id)) {
          addPending(aluno, notice);
        }
      }
    }
  }

  let totalPendingNotices = 0;
  pendingNoticesByStudent.forEach((entry) => {
    totalPendingNotices += entry.notices.length;
  });

  const managementNotices = !isGestor
    ? await prisma.notice.findMany({
        where: {
          targetRole: 'PROFESSOR',
          OR: [{ professorId: userId }, { professorId: null }],
        },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const sentNotices = isGestor
    ? await prisma.notice.findMany({
        where: { authorId: userId, targetRole: 'PROFESSOR' },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const gestaoMessages = !isGestor
    ? await prisma.question.findMany({
        where: {
          teacherId: userId,
          senderRole: 'GESTOR',
          parentId: null,
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
          teacher: { select: { name: true } },
          answeredBy: { select: { name: true } },
          children: {
            orderBy: { createdAt: 'asc' },
            include: { answeredBy: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const sentGestaoMessages = isGestor
    ? await prisma.question.findMany({
        where: {
          senderRole: 'GESTOR',
          parentId: null,
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
          teacher: { select: { name: true } },
          answeredBy: { select: { name: true } },
          children: {
            orderBy: { createdAt: 'asc' },
            include: { answeredBy: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const pendingNoticesList = Array.from(pendingNoticesByStudent.entries());

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-[#f5f5f5] mb-2">Dashboard</h1>
        <p className="text-[#a1a1a1] mb-8">
          {isGestor ? 'Visão geral da gestão' : 'Visão geral do professor'}
        </p>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <p className="text-sm text-[#a1a1a1] mb-1">Avisos pendentes</p>
            <p className="text-3xl font-bold text-[#D4A373]">{totalPendingNotices}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <p className="text-sm text-[#a1a1a1] mb-1">Treinos pendentes</p>
            <p className="text-3xl font-bold text-[#D4A373]">{totalPendingWorkouts}</p>
          </div>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <p className="text-sm text-[#a1a1a1] mb-1">Dúvidas sem resposta</p>
            <p className="text-3xl font-bold text-[#D4A373]">{totalUnansweredQuestions}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
              Alunos com avisos pendentes
            </h2>
            {pendingNoticesList.length === 0 ? (
              <p className="text-sm text-[#a1a1a1]">Nenhum aviso pendente.</p>
            ) : (
              <ul className="space-y-3">
                {pendingNoticesList.map(([studentId, { student, notices }]) => (
                  <li
                    key={studentId}
                    className="p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-[#f5f5f5]">{student.name}</span>
                      {isGestor && (
                        <span className="text-xs text-[#D4A373] bg-[rgba(212,163,115,0.1)] px-2 py-1 rounded">
                          Prof: {student.user?.name ?? 'Desconhecido'}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {notices.map((notice) => (
                        <li
                          key={notice.id}
                          className="flex items-center justify-between text-sm text-[#a1a1a1]"
                        >
                          <span>{notice.title}</span>
                          <span>
                            {new Date(notice.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
              Alunos com treinos pendentes
            </h2>
            {pendingWorkouts.length === 0 ? (
              <p className="text-sm text-[#a1a1a1]">Nenhum treino pendente.</p>
            ) : (
              <ul className="space-y-3">
                {pendingWorkouts.map((workout) => (
                  <li
                    key={workout.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]"
                  >
                    <span className="text-[#f5f5f5]">{workout.student.name}</span>
                    {isGestor && (
                      <span className="text-xs text-[#D4A373] bg-[rgba(212,163,115,0.1)] px-2 py-1 rounded">
                        Prof: {workout.student.user?.name ?? 'Desconhecido'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
              Dúvidas sem resposta
            </h2>
            {unansweredQuestions.length === 0 ? (
              <p className="text-sm text-[#a1a1a1]">
                Nenhuma dúvida sem resposta.
              </p>
            ) : (
              <ul className="space-y-3">
                {unansweredQuestions.map((question) => (
                  <li
                    key={question.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]"
                  >
                    <span className="text-[#f5f5f5]">{question.student.name}</span>
                    {isGestor && (
                      <span className="text-xs text-[#D4A373] bg-[rgba(212,163,115,0.1)] px-2 py-1 rounded">
                        Prof: {question.student.user?.name ?? 'Desconhecido'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
              {isGestor ? 'Avisos enviados para professores' : 'Avisos da Gestão'}
            </h2>
            {(isGestor ? sentNotices : managementNotices).length === 0 ? (
              <p className="text-sm text-[#a1a1a1]">Nenhum aviso encontrado.</p>
            ) : (
              <ul className="space-y-3">
                {(isGestor ? sentNotices : managementNotices).map((notice) => (
                  <li
                    key={notice.id}
                    className="p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[#f5f5f5]">
                        {notice.title}
                      </span>
                      <span className="text-xs text-[#a1a1a1]">
                        {new Date(notice.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-sm text-[#a1a1a1]">
                      Por: {notice.author?.name ?? 'Desconhecido'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-[#f5f5f5] mb-4">
              {isGestor
                ? 'Mensagens enviadas para professores'
                : 'Mensagens da Gestão'}
            </h2>
            {(isGestor ? sentGestaoMessages : gestaoMessages).length === 0 ? (
              <p className="text-sm text-[#a1a1a1]">
                Nenhuma mensagem encontrada.
              </p>
            ) : (
              <ul className="space-y-3">
                {(isGestor ? sentGestaoMessages : gestaoMessages).map((msg) => {
                  const replies = (msg.children || []).filter(
                    (c) => c.senderRole === 'TEACHER'
                  );
                  const lastReply = replies[replies.length - 1];
                  return (
                    <li
                      key={msg.id}
                      className="p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#f5f5f5]">
                          {msg.student.name}
                          {isGestor && msg.teacher
                            ? ` - Prof: ${msg.teacher.name}`
                            : ''}
                        </span>
                        <span className="text-xs text-[#a1a1a1]">
                          {new Date(msg.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-[#f5f5f5] mb-2">{msg.content}</p>
                      {lastReply ? (
                        <div className="text-sm text-[#a1a1a1] border-l-2 border-[#D4A373] pl-3">
                          <p className="text-[#D4A373] mb-1">
                            {!isGestor
                              ? 'Resposta enviada ✓'
                              : `Resposta de ${
                                  lastReply.answeredBy?.name ?? 'Professor'
                                }`}
                          </p>
                          <p>{lastReply.content}</p>
                        </div>
                      ) : !isGestor ? (
                        <GestaoMessageReply
                          questionId={msg.id}
                          studentId={msg.studentId}
                          teacherId={userId}
                          currentUserId={userId}
                        />
                      ) : (
                        <p className="text-sm text-[#a1a1a1]">
                          Aguardando resposta do professor.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
