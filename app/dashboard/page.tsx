import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';
function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const myStudentIds = students.map((s) => s.id);
  const pendingWorkouts = await prisma.workout.findMany({
    where: isGestor
      ? { status: 'PENDENTE' }
      : { status: 'PENDENTE', studentId: { in: myStudentIds } },
    select: {
      id: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const unansweredQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      ...(isGestor ? {} : { studentId: { in: myStudentIds } }),
      children: { none: {} },
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const noticesWithReads = await prisma.notice.findMany({
    where: {
      OR: [
        { targetRole: role },
        { studentId: { in: myStudentIds } },
        { professorId: userId },
      ],
    },
    include: {
      reads: { select: { studentId: true } },
      author: { select: { id: true, name: true } },
      student: { select: { id: true, name: true } },
      professor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const pendingReads = noticesWithReads.filter((n) => {
    if (n.targetRole && n.targetRole !== role) return false;
    if (n.studentId && !myStudentIds.includes(n.studentId)) return false;
    if (n.professorId && n.professorId !== userId) return false;
    if (n.studentId) {
      return !n.reads.some((r) => r.studentId === n.studentId);
    }
    if (!isGestor) {
      return myStudentIds.some((id) => !n.reads.some((r) => r.studentId === id));
    }
    return false;
  });
  const managementNotices = await prisma.notice.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const managementMessages = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'GESTOR',
      ...(isGestor ? {} : { studentId: { in: myStudentIds } }),
    },
    include: {
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      answeredBy: { select: { id: true, name: true, role: true } },
      children: {
        orderBy: { createdAt: 'asc' },
        include: {
          answeredBy: { select: { id: true, name: true, role: true } },
          student: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Treinos pendentes</h2>
          {pendingWorkouts.length === 0 ? (
            <p className="text-zinc-400">Nenhum treino pendente.</p>
          ) : (
            <div className="grid gap-4">
              {pendingWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="bg-zinc-800 rounded-xl p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">Treino pendente</p>
                    <p className="text-sm text-zinc-400">
                      {w.student?.name || 'Aluno'} • {formatDate(w.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Dúvidas sem resposta</h2>
          {unansweredQuestions.length === 0 ? (
            <p className="text-zinc-400">Nenhuma dúvida sem resposta.</p>
          ) : (
            <div className="grid gap-4">
              {unansweredQuestions.map((q) => (
                <div key={q.id} className="bg-zinc-800 rounded-xl p-4">
                  <p className="font-medium">{q.student?.name || 'Aluno'}</p>
                  <p className="text-sm text-zinc-300 line-clamp-2">{q.content}</p>
                  <p className="text-xs text-zinc-500 mt-2">{formatDate(q.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Avisos pendentes de leitura</h2>
          {pendingReads.length === 0 ? (
            <p className="text-zinc-400">Nenhum aviso pendente.</p>
          ) : (
            <div className="grid gap-4">
              {pendingReads.map((n) => (
                <div key={n.id} className="bg-zinc-800 rounded-xl p-4">
                  <p className="font-medium">{n.title || 'Aviso'}</p>
                  <p className="text-sm text-zinc-300">{n.content}</p>
                  <p className="text-xs text-zinc-500 mt-2">
                    {n.author?.name || 'Gestão'} • {formatDate(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Avisos da gestão</h2>
          {managementNotices.length === 0 ? (
            <p className="text-zinc-400">Nenhum aviso publicado.</p>
          ) : (
            <div className="grid gap-4">
              {managementNotices.map((n) => (
                <div key={n.id} className="bg-zinc-800 rounded-xl p-4">
                  <p className="font-medium">{n.title || 'Aviso'}</p>
                  <p className="text-sm text-zinc-300">{n.content}</p>
                  <p className="text-xs text-zinc-500 mt-2">{formatDate(n.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Mensagens da gestão</h2>
          {managementMessages.length === 0 ? (
            <p className="text-zinc-400">Nenhuma mensagem da gestão.</p>
          ) : (
            <div className="grid gap-4">
              {managementMessages.map((msg) => {
                const replies = (msg.children || []).filter((c) => c.senderRole === 'TEACHER');
                const lastReply = replies[replies.length - 1];
                return (
                  <div key={msg.id} className="bg-zinc-800 rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {msg.student?.name || 'Aluno'} • {msg.teacher?.name || 'Professor'}
                        </p>
                        <p className="text-sm text-zinc-300 line-clamp-2">{msg.content}</p>
                        {lastReply && (
                          <p className="text-sm text-emerald-400 mt-2">
                            Última resposta: {lastReply.content} — {lastReply.answeredBy?.name}
                          </p>
                        )}
                      </div>
                      {!lastReply && !isGestor && (
                        <GestaoMessageReply
                          questionId={msg.id}
                          studentId={String(msg.studentId ?? '')}
                          teacherId={userId}
                          currentUserId={userId}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Meus alunos</h2>
          {students.length === 0 ? (
            <p className="text-zinc-400">Nenhum aluno encontrado.</p>
          ) : (
            <div className="grid gap-3">
              {students.map((s) => (
                <div key={s.id} className="bg-zinc-800 rounded-xl p-4 flex justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-zinc-400">{s.user?.name || s.user?.id}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
