import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';
import Link from 'next/link';
import { ReactNode } from 'react';

interface Student {
  id: string;
  name: string;
  userId: string | null;
  user: { id: string; name: string | null } | null;
}

interface PendingWorkout {
  id: string;
  createdAt: Date;
  student: { id: string; name: string } | null;
}

interface UnansweredQuestion {
  id: string;
  content: string;
  createdAt: Date;
  student: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  children: Array<{
    id: string;
    senderRole: string;
    content: string;
    createdAt: Date;
    answeredBy?: { id: string; name: string | null; role: string | null } | null;
  }>;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string | null;
  createdAt: Date;
  authorId: string | null;
  targetRole: string | null;
  studentId: string | null;
  professorId: string | null;
  author: { id: string; name: string | null; role: string | null } | null;
  student: { id: string; name: string } | null;
  professor: { id: string; name: string } | null;
  reads: Array<{ studentId: string | null }>;
}

interface ManagementMessage {
  id: string;
  content: string;
  createdAt: Date;
  studentId: string | null;
  teacherId: string | null;
  senderRole: string;
  parentId: string | null;
  student: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  answeredBy: { id: string; name: string | null; role: string | null } | null;
  children: Array<{
    id: string;
    senderRole: string;
    content: string;
    createdAt: Date;
    answeredBy?: { id: string; name: string | null; role: string | null } | null;
    student?: { id: string; name: string } | null;
    teacher?: { id: string; name: string } | null;
  }>;
}

const sidebarLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/biblioteca', label: 'Biblioteca' },
  { href: '/montar-treino', label: 'Montar Treino' },
  { href: '/mural', label: 'Mural' },
  { href: '/vincular-alunos', label: 'Vincular Alunos' },
  { href: '/gerenciar-alunos', label: 'Gerenciar Alunos' },
  { href: '/gerenciar-professores', label: 'Gerenciar Professores' },
  { href: '/gerenciar-gestores', label: 'Gerenciar Gestores' },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatLongDate(date: Date) {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const role = (session.user as any)?.role?.toUpperCase?.() || '';
  const isTeacher = role === 'TEACHER' || role === 'PROFESSOR';
  const isGestor = role === 'GESTOR' || role === 'ADMIN';
  const userName = (session.user as any)?.name || 'Usuário';

  const rawStudents = await prisma.student.findMany({
    where: isTeacher ? { userId } : {},
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { id: true, name: true } },
    },
  });
  const students = rawStudents as unknown as Student[];
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const myStudentIds = students.map((s) => s.id);

  const rawPendingWorkouts = await prisma.workout.findMany({
    where: {
      status: 'PENDENTE',
      ...(isTeacher && myStudentIds.length ? { studentId: { in: myStudentIds } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const pendingWorkouts = rawPendingWorkouts as unknown as PendingWorkout[];

  const rawUnansweredQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      ...(isTeacher && myStudentIds.length ? { studentId: { in: myStudentIds } } : {}),
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      children: {
        select: {
          id: true,
          senderRole: true,
          content: true,
          createdAt: true,
          answeredBy: { select: { id: true, name: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const unansweredQuestions = (rawUnansweredQuestions as unknown as UnansweredQuestion[]).filter(
    (q) => !q.children.some((c) => c.senderRole === 'TEACHER')
  );

  const rawNotices = await prisma.notice.findMany({
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
      author: { select: { id: true, name: true, role: true } },
      student: { select: { id: true, name: true } },
      professor: { select: { id: true, name: true } },
      reads: { select: { studentId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const notices = rawNotices as unknown as Notice[];

  let pendingNotices: Notice[] = [];
  if (isTeacher) {
    pendingNotices = notices.filter((n) => {
      if (n.professorId && n.professorId === userId) return true;
      if (n.studentId && myStudentIds.includes(n.studentId)) return true;
      if (!n.studentId && !n.professorId) {
        const targetRole = (n.targetRole || '').toUpperCase();
        if (targetRole === 'TEACHER' || targetRole === 'PROFESSOR' || targetRole === 'ALL') return true;
      }
      return false;
    });
  } else if (isGestor) {
    pendingNotices = notices.filter((n) => {
      if (n.studentId && !n.reads.some((r) => r.studentId === n.studentId)) return true;
      if (!n.studentId && n.reads.length === 0) return true;
      return false;
    });
  }

  const managementNotices = notices.filter((n) => {
    if (!n.author) return false;
    const authorRole = (n.author.role || '').toUpperCase();
    if (authorRole === 'GESTOR' || authorRole === 'ADMIN') return true;
    const targetRole = (n.targetRole || '').toUpperCase();
    if (isTeacher && (targetRole === 'TEACHER' || targetRole === 'PROFESSOR' || targetRole === 'ALL')) return true;
    if (isGestor && (targetRole === 'GESTOR' || targetRole === 'ADMIN' || targetRole === 'ALL')) return true;
    return false;
  });

  const rawManagementMessages = await prisma.question.findMany({
    where: {
      senderRole: 'GESTOR',
      parentId: null,
      ...(isTeacher ? { teacherId: userId } : {}),
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
  });
  const managementMessages = rawManagementMessages as unknown as ManagementMessage[];

  const totalNotices = notices.length;
  const unreadNotices = pendingNotices.length;
  const pendingWorkoutCount = pendingWorkouts.length;
  const unansweredCount = unansweredQuestions.length;

  const longDate = formatLongDate(new Date());

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <aside className="w-64 flex-shrink-0 bg-[#111111] border-r border-[#ffffff10] flex flex-col">
        <div className="p-6 border-b border-[#ffffff10]">
          <h2 className="text-xl font-bold tracking-tight text-[#f5f5f5]">
            Funcional Vip Digital
          </h2>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {sidebarLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-4 py-2.5 rounded-lg text-sm text-[#a1a1a1] hover:bg-[#ffffff08] hover:text-[#f5f5f5] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#ffffff10] flex items-center justify-between px-8 bg-[#111111]">
          <div>
            <h1 className="text-lg font-semibold text-[#f5f5f5]">
              Olá, {userName} 👋
            </h1>
            <p className="text-xs text-[#a1a1a1]">{longDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#D4A373]/20 text-[#D4A373] border border-[#D4A373]/30">
              {role || 'Usuário'}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#ffffff10] text-[#a1a1a1] border border-[#ffffff10]">
              {myStudentIds.length} alunos
            </span>
          </div>
        </header>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SummaryCard
              title="Avisos enviados"
              value={totalNotices}
              subtitle={`${unreadNotices} não lidos`}
            />
            <SummaryCard
              title="Treinos não concluídos"
              value={pendingWorkoutCount}
              subtitle="pendentes"
            />
            <SummaryCard
              title="Dúvidas aguardando resposta"
              value={unansweredCount}
              subtitle="sem resposta"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Block title="Alunos com treinos pendentes">
              {pendingWorkouts.length > 0 ? (
                pendingWorkouts.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10]"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">
                      {w.student?.name || 'Aluno sem nome'}
                    </p>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Treino pendente • {formatDate(w.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhum treino pendente.</p>
              )}
            </Block>

            <Block title="Dúvidas sem resposta">
              {unansweredQuestions.length > 0 ? (
                unansweredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10]"
                  >
                    <p className="text-sm text-[#f5f5f5] line-clamp-2">{q.content}</p>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      {q.student?.name || 'Aluno'} • {formatDate(q.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhuma dúvida aguardando resposta.</p>
              )}
            </Block>

            <Block title="Avisos com leitura pendente">
              {pendingNotices.length > 0 ? (
                pendingNotices.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10]"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">{n.title}</p>
                    <p className="text-xs text-[#a1a1a1] line-clamp-2 mt-1">{n.content}</p>
                    <p className="text-xs text-[#a1a1a1] mt-1">{formatDate(n.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso com leitura pendente.</p>
              )}
            </Block>

            <Block title="Avisos da gestão">
              {managementNotices.length > 0 ? (
                managementNotices.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10]"
                  >
                    <p className="text-sm font-medium text-[#f5f5f5]">{n.title}</p>
                    <p className="text-xs text-[#a1a1a1] line-clamp-2 mt-1">{n.content}</p>
                    <p className="text-xs text-[#D4A373] mt-1">
                      {n.author?.name || 'Gestão'} • {formatDate(n.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhum aviso da gestão.</p>
              )}
            </Block>

            <Block title="Mensagens da gestão">
              {managementMessages.length > 0 ? (
                managementMessages.map((msg) => {
                  const replies = (msg.children || []).filter((c) => c.senderRole === 'TEACHER');
                  const lastReply = replies[replies.length - 1];
                  return (
                    <div
                      key={msg.id}
                      className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10]"
                    >
                      <p className="text-sm text-[#f5f5f5]">{msg.content}</p>
                      <p className="text-xs text-[#a1a1a1] mt-1">
                        {msg.student?.name || msg.teacher?.name || 'Gestão'} • {formatDate(msg.createdAt)}
                      </p>
                      {lastReply ? (
                        <div className="mt-2 pl-3 border-l-2 border-[#D4A373]">
                          <p className="text-xs text-[#D4A373] font-medium">
                            Resposta de {lastReply.answeredBy?.name || 'Professor'}:
                          </p>
                          <p className="text-xs text-[#a1a1a1] line-clamp-2">{lastReply.content}</p>
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
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhuma mensagem da gestão.</p>
              )}
            </Block>

            <Block title="Meus alunos">
              {students.length > 0 ? (
                students.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-lg bg-[#ffffff05] border border-[#ffffff10] flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#f5f5f5]">{s.name}</p>
                      {s.user?.name && (
                        <p className="text-xs text-[#a1a1a1]">Usuário: {s.user.name}</p>
                      )}
                    </div>
                    <Link
                      href={`/alunos/${s.id}`}
                      className="text-xs text-[#D4A373] hover:underline"
                    >
                      Ver
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#a1a1a1]">Nenhum aluno vinculado.</p>
              )}
            </Block>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number;
  subtitle: string;
}) {
  return (
    <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6 hover:border-[#D4A373]/30 transition-colors">
      <p className="text-sm text-[#a1a1a1]">{title}</p>
      <p className="text-3xl font-bold text-[#f5f5f5] mt-2">{value}</p>
      <p className="text-xs text-[#D4A373] mt-1">{subtitle}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-[#111111] border border-[#ffffff10] rounded-xl p-6">
      <h3 className="text-sm font-semibold text-[#f5f5f5] mb-4 uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
