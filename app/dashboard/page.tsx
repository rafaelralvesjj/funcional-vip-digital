import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import GestaoMessageReply from '@/components/GestaoMessageReply';
import ManagementNoticeModalList from '@/components/ManagementNoticeModalList';
import DashboardAutoRefresh from '@/components/DashboardAutoRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id) {
    redirect('/login');
  }

  const userId = String(sessionUser.id);
  const role = String(sessionUser?.role || '').toUpperCase();
  const isTeacher = role === 'TEACHER' || role === 'PROFESSOR';
  const isGestor = role === 'GESTOR' || role === 'ADMIN';
  const userName = sessionUser?.name || 'Usuário';

  const labels = {
    studentsCard: isGestor ? 'Todos os alunos' : 'Meus alunos',

    pendingWorkoutsCard: isGestor
      ? 'Treinos pendentes de todos os alunos'
      : 'Treinos pendentes dos meus alunos',

    unansweredQuestionsCard: isGestor
      ? 'Dúvidas sem resposta de todos os alunos'
      : 'Dúvidas sem resposta dos meus alunos',

    pendingNoticesCard: isGestor
      ? 'Avisos pendentes de todos os alunos'
      : 'Avisos pendentes dos meus alunos',

    managementNoticesCard: isGestor
      ? 'Avisos da gestão de todos os professores'
      : 'Avisos da gestão direcionado a mim',

    managementMessagesCard: isGestor
      ? 'Mensagens da gestão todos os alunos e professores'
      : 'Mensagens da gestão direcionado a mim',

    pendingWorkoutsList: isGestor
      ? 'Treinos Pendentes de todos os alunos'
      : 'Treinos Pendentes dos meus alunos',

    pendingNoticesList: isGestor
      ? 'Avisos com leitura pendente de todos os alunos'
      : 'Avisos com leitura pendente dos meus alunos',

    unansweredQuestionsList: isGestor
      ? 'Dúvidas sem resposta de todos os alunos'
      : 'Dúvidas sem resposta dos meus alunos',

    managementNoticesList: isGestor
      ? 'Avisos da gestão de todos os professores'
      : 'Avisos da gestão direcionado para mim',

    managementMessagesList: isGestor
      ? 'Mensagens da gestão todos os alunos e professores'
      : 'Mensagens da gestão direcionado para mim',

    studentsList: isGestor ? 'Todos os alunos' : 'Meus alunos',
  };

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function normalizeRole(value?: string | null): string {
    const roleValue = String(value || '').toUpperCase();

    if (roleValue === 'ALUNO') return 'STUDENT';
    if (roleValue === 'PROFESSOR') return 'TEACHER';

    return roleValue;
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
    orderBy: {
      name: 'asc',
    },
  });

  const myStudentIds = students.map((student) => student.id);

  const professors = await prisma.user.findMany({
    where: {
      role: {
        in: ['PROFESSOR', 'TEACHER'],
      },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const professorIds = professors.map((professor) => professor.id);

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
          user: {
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

  const unansweredQuestions = await prisma.question.findMany({
    where: {
      parentId: null,
      senderRole: 'STUDENT',
      ...(isTeacher ? { studentId: { in: myStudentIds } } : {}),
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
    orderBy: {
      createdAt: 'desc',
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
          professorId: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  /*
   * Regra de avisos pendentes:
   *
   * 1. Aviso para aluno específico:
   *    - aparece para o aluno;
   *    - aparece para a gestão;
   *    - NÃO aparece para professor, mesmo que o aluno esteja vinculado a ele.
   *
   * 2. Aviso para todos os alunos:
   *    - no gestor, conta 1 pendência para cada aluno que ainda não leu;
   *    - no professor, conta 1 pendência para cada aluno dele que ainda não leu.
   */
  const pendingNoticeItems = notices.flatMap((notice) => {
    const targetRole = normalizeRole(notice.targetRole);

    if (targetRole !== 'STUDENT') {
      return [];
    }

    if (isTeacher && notice.studentId) {
      return [];
    }

    const targetStudents = notice.studentId
      ? students.filter((student) => student.id === notice.studentId)
      : students;

    if (targetStudents.length === 0) {
      return [];
    }

    const readStudentIds = new Set(
      notice.reads
        .map((read) => read.studentId)
        .filter((studentId): studentId is string => Boolean(studentId))
    );

    return targetStudents
      .filter((student) => !readStudentIds.has(student.id))
      .map((student) => ({
        notice,
        student,
      }));
  });

  const managementNotices = notices.filter((notice) => {
    const authorRole = normalizeRole(notice.author?.role);
    const noticeType = String(notice.type || '').toUpperCase();
    const targetRole = normalizeRole(notice.targetRole);

    const isManagementNotice =
      authorRole === 'GESTOR' ||
      authorRole === 'ADMIN' ||
      noticeType === 'MANAGEMENT';

    if (!isManagementNotice) {
      return false;
    }

    /*
     * "Avisos da gestão" mostra somente avisos enviados para professores.
     * Avisos enviados para alunos ficam no bloco de avisos pendentes dos alunos.
     */
    if (targetRole !== 'TEACHER') {
      return false;
    }

    if (isTeacher) {
      return !notice.professorId || notice.professorId === userId;
    }

    return true;
  });

  const unreadManagementNoticesCount = managementNotices.filter((notice) => {
    const readProfessorIds = new Set(
      notice.reads
        .map((read) => read.professorId)
        .filter((professorId): professorId is string => Boolean(professorId))
    );

    if (isTeacher) {
      return !readProfessorIds.has(userId);
    }

    if (isGestor) {
      const targetProfessorIds = notice.professorId ? [notice.professorId] : professorIds;

      if (targetProfessorIds.length === 0) {
        return false;
      }

      return targetProfessorIds.some((professorId) => !readProfessorIds.has(professorId));
    }

    return false;
  }).length;

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

  const questionsWithoutAnswer = unansweredQuestions.filter((question) => {
    const answerRoles = ['TEACHER', 'PROFESSOR', 'GESTOR', 'ADMIN'];

    return !question.children.some((child) =>
      answerRoles.includes(normalizeRole(child.senderRole))
    );
  });

  function getNoticeTargetLabel(notice: (typeof notices)[number]): string {
    const targetRole = normalizeRole(notice.targetRole);

    if (targetRole === 'TEACHER') {
      if (notice.professor?.name) {
        return `Professor: ${notice.professor.name}`;
      }

      return 'Todos os professores';
    }

    if (targetRole === 'STUDENT') {
      if (notice.student?.name) {
        return `Aluno: ${notice.student.name}`;
      }

      return 'Todos os alunos';
    }

    return 'Público não informado';
  }

  function getManagementMessageTargetLabel(
    message: (typeof managementMessages)[number]
  ): string {
    if (message.student?.name && message.teacher?.name) {
      return `${message.student.name} → ${message.teacher.name}`;
    }

    if (message.teacher?.name) {
      return `Professor: ${message.teacher.name}`;
    }

    if (message.student?.name) {
      return `Aluno: ${message.student.name}`;
    }

    return 'Todos os alunos e professores';
  }

  function getManagementNoticeReadStatus(notice: (typeof notices)[number]): {
    readByCurrentUser: boolean;
    readStatusLabel: string;
    readStatusVariant: 'read' | 'pending' | 'neutral';
    readStatusDescription: string;
  } {
    const readProfessorIds = new Set(
      notice.reads
        .map((read) => read.professorId)
        .filter((professorId): professorId is string => Boolean(professorId))
    );

    if (isTeacher) {
      const readByCurrentUser = readProfessorIds.has(userId);

      return {
        readByCurrentUser,
        readStatusLabel: readByCurrentUser ? 'Lido' : 'Pendente',
        readStatusVariant: readByCurrentUser ? 'read' : 'pending',
        readStatusDescription: readByCurrentUser
          ? 'Você já leu este aviso.'
          : 'Aguardando sua leitura.',
      };
    }

    if (isGestor) {
      const targetProfessorIds = notice.professorId ? [notice.professorId] : professorIds;
      const totalTargetProfessors = targetProfessorIds.length;
      const totalReadProfessors = targetProfessorIds.filter((professorId) =>
        readProfessorIds.has(professorId)
      ).length;

      if (totalTargetProfessors === 0) {
        return {
          readByCurrentUser: false,
          readStatusLabel: 'Sem professores',
          readStatusVariant: 'neutral',
          readStatusDescription: 'Nenhum professor foi encontrado para este aviso.',
        };
      }

      const allRead = totalReadProfessors === totalTargetProfessors;

      return {
        readByCurrentUser: false,
        readStatusLabel: allRead ? 'Lido' : 'Pendente',
        readStatusVariant: allRead ? 'read' : 'pending',
        readStatusDescription: `${totalReadProfessors}/${totalTargetProfessors} professor(es) leram.`,
      };
    }

    return {
      readByCurrentUser: false,
      readStatusLabel: 'Pendente',
      readStatusVariant: 'pending',
      readStatusDescription: '',
    };
  }

  const managementNoticeItems = managementNotices.map((notice) => {
    const readStatus = getManagementNoticeReadStatus(notice);

    return {
      id: notice.id,
      title: notice.title || 'Aviso da gestão',
      content: notice.content,
      type: notice.type,
      createdAt: notice.createdAt.toISOString(),
      authorName: notice.author?.name || 'Gestão',
      authorRole: notice.author?.role || null,
      targetLabel: getNoticeTargetLabel(notice),
      ...readStatus,
    };
  });

  const summaryCards = [
    {
      label: labels.studentsCard,
      value: students.length,
    },
    {
      label: labels.pendingWorkoutsCard,
      value: pendingWorkouts.length,
    },
    {
      label: labels.unansweredQuestionsCard,
      value: questionsWithoutAnswer.length,
    },
    {
      label: labels.pendingNoticesCard,
      value: pendingNoticeItems.length,
    },
    {
      label: labels.managementNoticesCard,
      value: unreadManagementNoticesCount,
    },
    {
      label: labels.managementMessagesCard,
      value: managementMessages.length,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-6 md:p-8">
      <DashboardAutoRefresh />

      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#f5f5f5]">
            Olá, {userName}
          </h1>

          <p className="mt-2 text-[#a1a1a1]">
            Bem-vindo ao painel administrativo. Aqui está o resumo das atividades pendentes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6"
            >
              <p className="text-[#a1a1a1] text-sm min-h-[40px]">
                {card.label}
              </p>

              <p className="text-3xl font-semibold text-[#D4A373] mt-2">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.pendingWorkoutsList}
          </h2>

          {pendingWorkouts.length === 0 ? (
            <p className="text-[#a1a1a1]">
              Nenhum treino pendente no momento.
            </p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {pendingWorkouts.map((workout) => (
                <div
                  key={workout.id}
                  className="py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-[#f5f5f5] font-medium">
                      {workout.student?.name || 'Aluno'}
                    </p>

                    {isGestor && (
                      <p className="text-[#a1a1a1] text-sm">
                        Professor: {workout.student?.user?.name || 'Não vinculado'}
                      </p>
                    )}

                    <p className="text-[#a1a1a1] text-sm">
                      {formatDate(workout.createdAt)}
                    </p>
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
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.unansweredQuestionsList}
          </h2>

          {questionsWithoutAnswer.length === 0 ? (
            <p className="text-[#a1a1a1]">
              Nenhuma dúvida aguardando resposta.
            </p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {questionsWithoutAnswer.map((question) => (
                <div key={question.id} className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[#f5f5f5] font-medium">
                      {question.student?.name || 'Aluno'}
                    </p>

                    <p className="text-[#a1a1a1] text-sm">
                      {formatDate(question.createdAt)}
                    </p>
                  </div>

                  <p className="text-[#a1a1a1] mt-2 line-clamp-2">
                    {question.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.pendingNoticesList}
          </h2>

          {pendingNoticeItems.length === 0 ? (
            <p className="text-[#a1a1a1]">
              Nenhum aviso pendente de leitura.
            </p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {pendingNoticeItems.map((item) => (
                <div key={`${item.notice.id}-${item.student.id}`} className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[#f5f5f5] font-medium">
                      {item.notice.title || 'Aviso'}
                    </p>

                    <p className="text-[#a1a1a1] text-sm">
                      {formatDate(item.notice.createdAt)}
                    </p>
                  </div>

                  <p className="text-[#a1a1a1] mt-2">
                    {item.notice.content}
                  </p>

                  <div className="flex flex-wrap gap-3 mt-2 text-sm">
                    <span className="text-[#D4A373]">
                      Aluno pendente: {item.student.name}
                    </span>

                    <span className="text-[#a1a1a1]">
                      {getNoticeTargetLabel(item.notice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.managementNoticesList}
          </h2>

          <ManagementNoticeModalList
            notices={managementNoticeItems}
            emptyMessage="Nenhum aviso da gestão."
            markAsReadOnClose={isTeacher}
            showReadStatus={true}
          />
        </div>

        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.managementMessagesList}
          </h2>

          {managementMessages.length === 0 ? (
            <p className="text-[#a1a1a1]">
              Nenhuma mensagem da gestão.
            </p>
          ) : (
            <div className="divide-y divide-[#ffffff10]">
              {managementMessages.map((message) => {
                const replies = message.children || [];
                const lastReply = replies[replies.length - 1];

                return (
                  <div key={message.id} className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[#f5f5f5] font-medium">
                        {getManagementMessageTargetLabel(message)}
                      </p>

                      <p className="text-[#a1a1a1] text-sm">
                        {formatDate(message.createdAt)}
                      </p>
                    </div>

                    <p className="text-[#a1a1a1] mt-2">
                      {message.content}
                    </p>

                    {lastReply ? (
                      <div className="mt-3 p-3 rounded-lg bg-[#0a0a0a] border border-[#ffffff10]">
                        <p className="text-[#a1a1a1] text-sm">
                          Última resposta de {lastReply.answeredBy?.name || 'Professor'}:
                        </p>

                        <p className="text-[#f5f5f5] mt-1">
                          {lastReply.content}
                        </p>
                      </div>
                    ) : !isGestor ? (
                      <div className="mt-3">
                        <GestaoMessageReply
                          questionId={message.id}
                          studentId={String(message.studentId ?? '')}
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
          <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
            {labels.studentsList}
          </h2>

          {students.length === 0 ? (
            <p className="text-[#a1a1a1]">
              Nenhum aluno vinculado.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="p-4 rounded-xl bg-[#0a0a0a] border border-[#ffffff10]"
                >
                  <p className="text-[#f5f5f5] font-medium">
                    {student.name}
                  </p>

                  <p className="text-[#a1a1a1] text-sm">
                    Professor: {student.user?.name || 'Não vinculado'}
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
