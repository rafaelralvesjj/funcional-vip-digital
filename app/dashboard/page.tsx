import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const userId = session.user.id;
  const role = (session.user as any)?.role;
  const isGestor = role === 'GESTOR';

  const students = await prisma.student.findMany({
    where: isGestor ? undefined : { userId },
    select: {
      id: true,
      name: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const myStudentIds = students.map((s) => s.id);

  const pendingWorkouts =
    myStudentIds.length > 0
      ? await prisma.workout.findMany({
          where: {
            status: 'PENDENTE',
            studentId: { in: myStudentIds },
          },
          select: {
            id: true,
            name: true,
            student: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];

  const pendingQuestions =
    myStudentIds.length > 0
      ? await prisma.message.findMany({
          where: {
            parentId: null,
            senderRole: 'STUDENT',
            studentId: { in: myStudentIds },
            children: {
              none: {
                senderRole: 'TEACHER',
              },
            },
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
          },
        })
      : [];

  const noticesWhere = isGestor
    ? { targetRole: 'ALUNO' }
    : { targetRole: 'ALUNO', authorId: userId };

  const noticesWithReads = await prisma.notice.findMany({
    where: noticesWhere,
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      reads: {
        select: {
          studentId: true,
        },
      },
    },
  });

  const pendingReads: { student: (typeof students)[number]; notice: (typeof noticesWithReads)[number] }[] = [];

  for (const notice of noticesWithReads) {
    const readIds = new Set(notice.reads.map((r) => r.studentId));
    for (const student of students) {
      if (!readIds.has(student.id)) {
        pendingReads.push({ student, notice });
      }
    }
  }

  const gestaoNotices = isGestor
    ? await prisma.notice.findMany({
        where: {
          authorId: userId,
          targetRole: 'PROFESSOR',
        },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
        },
      })
    : await prisma.notice.findMany({
        where: {
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

  const gestaoMessagesWhere = isGestor
    ? {
        senderRole: 'GESTOR' as const,
        parentId: null,
      }
    : {
        teacherId: userId,
        senderRole: 'GESTOR' as const,
        parentId: null,
      };

  const gestaoMessages = await prisma.message.findMany({
    where: gestaoMessagesWhere,
    orderBy: {
      createdAt: 'desc',
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
            },
          },
        },
      },
    },
  });

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <main
      className="min-h-screen p-6 md:p-10"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold md:text-3xl"
            style={{ color: '#f5f5f5' }}
          >
            Dashboard
          </h1>
          <p style={{ color: '#a1a1a1' }}>
            Olá, {session.user.name || userId}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
          >
            <p style={{ color: '#a1a1a1' }}>Treinos pendentes</p>
            <p
              className="mt-2 text-3xl font-semibold"
              style={{ color: '#D4A373' }}
            >
              {pendingWorkouts.length}
            </p>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
          >
            <p style={{ color: '#a1a1a1' }}>Dúvidas sem resposta</p>
            <p
              className="mt-2 text-3xl font-semibold"
              style={{ color: '#D4A373' }}
            >
              {pendingQuestions.length}
            </p>
          </div>

          <div
            className="rounded-lg border p-4"
            style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
          >
            <p style={{ color: '#a1a1a1' }}>Avisos com leitura pendente</p>
            <p
              className="mt-2 text-3xl font-semibold"
              style={{ color: '#D4A373' }}
            >
              {pendingReads.length}
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-lg border p-5"
            style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
          >
            <h2
              className="mb-4 text-lg font-medium"
              style={{ color: '#f5f5f5' }}
            >
              Treinos pendentes
            </h2>
            {pendingWorkouts.length === 0 ? (
              <p style={{ color: '#a1a1a1' }}>Nenhum treino pendente.</p>
            ) : (
              <ul className="space-y-3">
                {pendingWorkouts.map((w) => (
                  <li
                    key={w.id}
                    className="rounded border p-3"
                    style={{ borderColor: '#ffffff10' }}
                  >
                    <p style={{ color: '#f5f5f5' }}>{w.name}</p>
                    <p className="text-sm" style={{ color: '#a1a1a1' }}>
                      {w.student?.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className="rounded-lg border p-5"
            style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
          >
            <h2
              className="mb-4 text-lg font-medium"
              style={{ color: '#f5f5f5' }}
            >
              Dúvidas sem resposta
            </h2>
            {pendingQuestions.length === 0 ? (
              <p style={{ color: '#a1a1a1' }}>Nenhuma dúvida pendente.</p>
            ) : (
              <ul className="space-y-3">
                {pendingQuestions.map((q) => (
                  <li
                    key={q.id}
                    className="rounded border p-3"
                    style={{ borderColor: '#ffffff10' }}
                  >
                    <p style={{ color: '#f5f5f5' }}>{q.content}</p>
                    <p className="text-sm" style={{ color: '#a1a1a1' }}>
                      {q.student?.name} • {formatDate(q.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div
          className="rounded-lg border p-5"
          style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
        >
          <h2 className="mb-4 text-lg font-medium" style={{ color: '#f5f5f5' }}>
            Avisos com leitura pendente por aluno
          </h2>
          {pendingReads.length === 0 ? (
            <p style={{ color: '#a1a1a1' }}>
              Nenhum aviso pendente de leitura.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {pendingReads.map(({ student, notice }) => (
                <li
                  key={`${student.id}-${notice.id}`}
                  className="rounded border p-3"
                  style={{ borderColor: '#ffffff10' }}
                >
                  <p style={{ color: '#f5f5f5' }}>{student.name}</p>
                  <p className="text-sm" style={{ color: '#a1a1a1' }}>
                    {notice.title} • {formatDate(notice.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="rounded-lg border p-5"
          style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
        >
          <h2 className="mb-4 text-lg font-medium" style={{ color: '#f5f5f5' }}>
            Avisos da gestão / enviados
          </h2>
          {gestaoNotices.length === 0 ? (
            <p style={{ color: '#a1a1a1' }}>Nenhum aviso da gestão.</p>
          ) : (
            <ul className="space-y-3">
              {gestaoNotices.map((n) => (
                <li
                  key={n.id}
                  className="rounded border p-3"
                  style={{ borderColor: '#ffffff10' }}
                >
                  <p style={{ color: '#f5f5f5' }}>{n.title}</p>
                  <p className="text-sm" style={{ color: '#a1a1a1' }}>
                    {formatDate(n.createdAt)}
                  </p>
                  {n.content && (
                    <p className="mt-1 text-sm" style={{ color: '#a1a1a1' }}>
                      {n.content}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="rounded-lg border p-5"
          style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
        >
          <h2 className="mb-4 text-lg font-medium" style={{ color: '#f5f5f5' }}>
            Mensagens da gestão / enviadas
          </h2>
          {gestaoMessages.length === 0 ? (
            <p style={{ color: '#a1a1a1' }}>Nenhuma mensagem da gestão.</p>
          ) : (
            <ul className="space-y-4">
              {gestaoMessages.map((msg) => {
                const replies = (msg.children || []).filter(
                  (c) => c.senderRole === 'TEACHER'
                );
                const lastReply = replies[replies.length - 1];
                const hasTeacherReply = !!lastReply;

                return (
                  <li
                    key={msg.id}
                    className="rounded border p-4"
                    style={{ borderColor: '#ffffff10' }}
                  >
                    <div className="mb-2">
                      <p style={{ color: '#f5f5f5' }}>{msg.content}</p>
                      <p className="text-sm" style={{ color: '#a1a1a1' }}>
                        Aluno: {msg.student?.name}
                        {msg.teacher?.name && ` • Professor: ${msg.teacher.name}`}
                        {' • '}
                        {formatDate(msg.createdAt)}
                      </p>
                    </div>

                    {hasTeacherReply ? (
                      <div
                        className="rounded border p-3"
                        style={{ borderColor: '#ffffff10' }}
                      >
                        <p
                          className="text-sm font-medium"
                          style={{ color: '#D4A373' }}
                        >
                          Resposta de {lastReply.answeredBy?.name || 'Professor'}
                        </p>
                        <p className="mt-1 text-sm" style={{ color: '#f5f5f5' }}>
                          {lastReply.content}
                        </p>
                      </div>
                    ) : (
                      !isGestor && (
                        <GestaoMessageReply
                          questionId={msg.id}
                          studentId={msg.studentId}
                          teacherId={userId}
                          currentUserId={userId}
                        />
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="rounded-lg border p-5"
          style={{ backgroundColor: '#111111', borderColor: '#ffffff10' }}
        >
          <h2 className="mb-4 text-lg font-medium" style={{ color: '#f5f5f5' }}>
            Meus alunos
          </h2>
          {students.length === 0 ? (
            <p style={{ color: '#a1a1a1' }}>Nenhum aluno encontrado.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => (
                <li
                  key={s.id}
                  className="rounded border p-3"
                  style={{ borderColor: '#ffffff10' }}
                >
                  <p style={{ color: '#f5f5f5' }}>{s.name}</p>
                  <p className="text-sm" style={{ color: '#a1a1a1' }}>
                    {s.user?.name || s.user?.id}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
