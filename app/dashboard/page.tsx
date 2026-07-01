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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect('/login');
  }

  const role = (session?.user as any)?.role?.toUpperCase?.() || '';
  const isTeacher = role === 'TEACHER' || role === 'PROFESSOR';
  const isGestor = role === 'GESTOR' || role === 'ADMIN';

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

  const studentMap = new Map(students.map((s) => [s.id, s]));
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
  });

  const allUnansweredQuestions = await prisma.question.findMany({
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
        },
      },
    },
  });

  const unansweredQuestions = allUnansweredQuestions.filter(
    (q) => !q.children.some((child) => child.senderRole === 'TEACHER')
  );

  const allNotices = await prisma.notice.findMany({
    where: isTeacher
      ? {
          OR: [{ professorId: userId }, { professorId: null }],
        }
      : {},
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
      studentId: true,
      professorId: true,
      targetRole: true,
      reads: {
        select: {
          studentId: true,
        },
      },
    },
  });

  const pendingNotices = allNotices.filter((n) => {
    if (isGestor) {
      return true;
    }
    if (isTeacher) {
      if (n.professorId === userId) {
        return true;
      }
      if (n.professorId === null && n.studentId === null) {
        return true;
      }
      if (n.studentId && myStudentIds.includes(n.studentId)) {
        const student = studentMap.get(n.studentId);
        const hasRead = n.reads.some((r) => r.studentId === student?.id);
        return !hasRead;
      }
      return false;
    }
    return false;
  });

  const managementNotices = await prisma.notice.findMany({
    where: { authorId: userId },
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      createdAt: true,
    },
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
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Treinos Pendentes</h2>
        <div className="space-y-4">
          {pendingWorkouts.length === 0 && (
            <p className="text-gray-400">Nenhum treino pendente.</p>
          )}
          {pendingWorkouts.map((w) => (
            <div key={w.id} className="bg-gray-800 rounded-lg p-4">
              <p className="font-medium">Treino pendente</p>
              <p className="text-sm text-gray-400">
                Aluno: {w.student?.name || 'Desconhecido'}
              </p>
              <p className="text-sm text-gray-400">{formatDate(w.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Perguntas sem Resposta</h2>
        <div className="space-y-4">
          {unansweredQuestions.length === 0 && (
            <p className="text-gray-400">Nenhuma pergunta sem resposta.</p>
          )}
          {unansweredQuestions.map((q) => (
            <div key={q.id} className="bg-gray-800 rounded-lg p-4">
              <p className="font-medium">{q.content}</p>
              <p className="text-sm text-gray-400">
                Aluno: {q.student?.name || 'Desconhecido'}
              </p>
              <p className="text-sm text-gray-400">
                Professor: {q.teacher?.name || 'Desconhecido'}
              </p>
              <p className="text-sm text-gray-400">{formatDate(q.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Avisos Pendentes</h2>
        <div className="space-y-4">
          {pendingNotices.length === 0 && (
            <p className="text-gray-400">Nenhum aviso pendente.</p>
          )}
          {pendingNotices.map((n) => (
            <div key={n.id} className="bg-gray-800 rounded-lg p-4">
              <p className="font-semibold">{n.title}</p>
              <p className="text-sm text-gray-300">{n.content}</p>
              <p className="text-sm text-gray-400">
                Autor: {n.author?.name || 'Desconhecido'}
              </p>
              <p className="text-sm text-gray-400">{formatDate(n.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Avisos da Gestão</h2>
        <div className="space-y-4">
          {managementNotices.length === 0 && (
            <p className="text-gray-400">Nenhum aviso da gestão.</p>
          )}
          {managementNotices.map((n) => (
            <div key={n.id} className="bg-gray-800 rounded-lg p-4">
              <p className="font-semibold">{n.title}</p>
              <p className="text-sm text-gray-300">{n.content}</p>
              <p className="text-sm text-gray-400">{formatDate(n.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Mensagens da Gestão</h2>
        <div className="space-y-4">
          {managementMessages.length === 0 && (
            <p className="text-gray-400">Nenhuma mensagem da gestão.</p>
          )}
          {managementMessages.map((msg) => {
            const replies = (msg.children || []).filter(
              (c: any) => c.senderRole === 'TEACHER'
            );
            const lastReply = replies[replies.length - 1];

            return (
              <div key={msg.id} className="bg-gray-800 rounded-lg p-4">
                <p className="font-semibold">Mensagem da gestão</p>
                <p className="text-sm text-gray-300">{msg.content}</p>
                <p className="text-sm text-gray-400">
                  Aluno: {msg.student?.name || 'Desconhecido'}
                </p>
                <p className="text-sm text-gray-400">
                  Professor: {msg.teacher?.name || 'Desconhecido'}
                </p>
                <p className="text-sm text-gray-400">
                  {formatDate(msg.createdAt)}
                </p>
                {lastReply ? (
                  <div className="mt-3 border-l-2 border-blue-500 pl-3">
                    <p className="text-sm text-gray-200">{lastReply.content}</p>
                    <p className="text-xs text-gray-400">
                      Última resposta por{' '}
                      {lastReply.answeredBy?.name || 'Desconhecido'}
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
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Meus alunos</h2>
        <div className="space-y-4">
          {students.length === 0 && (
            <p className="text-gray-400">Nenhum aluno vinculado.</p>
          )}
          {students.map((s) => (
            <div key={s.id} className="bg-gray-800 rounded-lg p-4">
              <p className="font-medium">{s.name}</p>
              <p className="text-sm text-gray-400">
                Usuário: {s.user?.name || 'Desconhecido'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
