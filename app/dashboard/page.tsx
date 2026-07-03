import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import DashboardConversationList from '@/components/DashboardConversationList';
import ManagementNoticeModalList from '@/components/ManagementNoticeModalList';
import DashboardAutoRefresh from '@/components/DashboardAutoRefresh';
import DashboardSectionSwitcher from '@/components/DashboardSectionSwitcher';

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

  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      createdAt: true,
    },
  });

  const labels = {
    studentsCard: isGestor ? 'Todos os alunos' : 'Meus alunos',

    awaitingAssignmentCard: 'Alunos aguardando vínculo',

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

    awaitingAssignmentList: 'Alunos aguardando vínculo',
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
      email: true,
      userId: true,
      userAuthId: true,
      onboardingCompleto: true,
      contractedTrainingDaysPerMonth: true,
      createdAt: true,
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
      createdAt: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const professorIds = professors.map((professor) => professor.id);

  const studentsAwaitingAssignment = isGestor
    ? students.filter((student) => {
        if (!student.onboardingCompleto) return false;

        const hasProfessorLinked =
          Boolean(student.userId) && professorIds.includes(student.userId);

        const hasContractedDays =
          typeof student.contractedTrainingDaysPerMonth === 'number' &&
          student.contractedTrainingDaysPerMonth > 0;

        return !hasProfessorLinked || !hasContractedDays;
      })
    : [];

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
      teacherId: {
        not: null,
      },
      ...(isTeacher ? { studentId: { in: myStudentIds } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      senderRole: true,
      content: true,
      answer: true,
      answeredAt: true,
      answeredById: true,
      createdAt: true,
      resolvedAt: true,
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
          studentId: true,
          teacherId: true,
          senderRole: true,
          content: true,
          createdAt: true,
          resolvedAt: true,
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
        orderBy: {
          createdAt: 'asc',
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
      : students.filter((student) => student.createdAt <= notice.createdAt);

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
      if (notice.professorId) {
        return notice.professorId === userId;
      }

      if (currentUser?.createdAt && notice.createdAt < currentUser.createdAt) {
        return false;
      }

      return true;
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
      const targetProfessorIds = notice.professorId
        ? [notice.professorId]
        : professors
            .filter((professor) => professor.createdAt <= notice.createdAt)
            .map((professor) => professor.id);

      if (targetProfessorIds.length === 0) {
        return false;
      }

      return targetProfessorIds.some((professorId) => !readProfessorIds.has(professorId));
    }

    return false;
  }).length;

  const managementMessages = await prisma.question.findMany({
    where: {
      parentId: null,
      ...(isTeacher
        ? {
            senderRole: 'GESTOR',
            teacherId: userId,
          }
        : {
            OR: [
              {
                senderRole: 'GESTOR',
              },
              {
                senderRole: 'STUDENT',
                teacherId: null,
              },
              {
                senderRole: 'TEACHER',
                studentId: null,
              },
            ],
          }),
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
    if (question.resolvedAt) return false;

    /*
     * Regra corrigida:
     * A dúvida volta para a lista sempre que a ÚLTIMA mensagem do fio for do aluno.
     *
     * Exemplo:
     * aluno pergunta -> aparece
     * professor responde -> sai da lista
     * aluno pergunta de novo no mesmo fio -> volta para a lista
     */
    const messages = [question, ...(question.children || [])];
    const lastMessage = messages[messages.length - 1];

    return normalizeRole(lastMessage?.senderRole) === 'STUDENT';
  });

  const unansweredQuestionConversationItems = questionsWithoutAnswer.map((question) => ({
    id: question.id,
    studentId: question.studentId || null,
    teacherId: question.teacherId || (isTeacher ? userId : null),
    content: question.content,
    senderRole: question.senderRole || 'STUDENT',
    createdAt: question.createdAt.toISOString(),
    resolvedAt: question.resolvedAt ? question.resolvedAt.toISOString() : null,
    answeredById: question.answeredById || null,
    openedById: question.answeredById || null,
    authorName: question.student?.name || 'Aluno',
    targetLabel: question.teacher?.name
      ? `Professor: ${question.teacher.name}`
      : isTeacher
        ? `Professor: ${userName}`
        : 'Professor',
    children: (question.children || []).map((reply) => ({
      id: reply.id,
      studentId: reply.studentId || question.studentId || null,
      teacherId: reply.teacherId || question.teacherId || (isTeacher ? userId : null),
      content: reply.content,
      senderRole: reply.senderRole || 'TEACHER',
      createdAt: reply.createdAt.toISOString(),
      resolvedAt: reply.resolvedAt ? reply.resolvedAt.toISOString() : null,
      authorName:
        reply.answeredBy?.name ||
        reply.teacher?.name ||
        reply.student?.name ||
        'Usuário',
    })),
  }));

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
    const senderRole = normalizeRole(message.senderRole);

    if (senderRole === 'STUDENT' && !message.teacherId) {
      return 'Gestão';
    }

    if (senderRole === 'TEACHER' && !message.studentId) {
      return 'Gestão';
    }

    if (message.student?.name && message.teacher?.name) {
      return `${message.student.name} → ${message.teacher.name}`;
    }

    if (message.teacher?.name) {
      return `Professor: ${message.teacher.name}`;
    }

    if (message.student?.name) {
      return `Aluno: ${message.student.name}`;
    }

    return 'Gestão';
  }

  function getMessageAuthorName(message: (typeof managementMessages)[number]): string {
    const senderRole = normalizeRole(message.senderRole);

    if (senderRole === 'GESTOR') {
      return message.answeredBy?.name || 'Gestor';
    }

    if (senderRole === 'STUDENT') {
      return message.student?.name || 'Aluno';
    }

    if (senderRole === 'TEACHER') {
      return message.teacher?.name || message.answeredBy?.name || 'Professor';
    }

    return message.answeredBy?.name || 'Usuário';
  }

  const managementConversationItems = managementMessages.map((message) => ({
    id: message.id,
    studentId: message.studentId || null,
    teacherId: message.teacherId || null,
    content: message.content,
    senderRole: message.senderRole || 'GESTOR',
    createdAt: message.createdAt.toISOString(),
    resolvedAt: message.resolvedAt ? message.resolvedAt.toISOString() : null,
    answeredById: message.answeredById || null,
    openedById: message.answeredById || null,
    authorName: getMessageAuthorName(message),
    targetLabel: getManagementMessageTargetLabel(message),
    children: (message.children || []).map((reply) => ({
      id: reply.id,
      studentId: reply.studentId || null,
      teacherId: reply.teacherId || null,
      content: reply.content,
      senderRole: reply.senderRole || 'GESTOR',
      createdAt: reply.createdAt.toISOString(),
      resolvedAt: reply.resolvedAt ? reply.resolvedAt.toISOString() : null,
      authorName:
        reply.answeredBy?.name ||
        reply.teacher?.name ||
        reply.student?.name ||
        'Usuário',
    })),
  }));

  const activeManagementMessagesCount = managementMessages.filter(
    (message) => !message.resolvedAt
  ).length;

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
      id: 'students',
      label: labels.studentsCard,
      value: students.length,
    },
    ...(isGestor
      ? [
          {
            id: 'awaiting-assignment',
            label: labels.awaitingAssignmentCard,
            value: studentsAwaitingAssignment.length,
          },
        ]
      : []),
    {
      id: 'pending-workouts',
      label: labels.pendingWorkoutsCard,
      value: pendingWorkouts.length,
    },
    {
      id: 'unanswered-questions',
      label: labels.unansweredQuestionsCard,
      value: questionsWithoutAnswer.length,
    },
    {
      id: 'pending-notices',
      label: labels.pendingNoticesCard,
      value: pendingNoticeItems.length,
    },
    {
      id: 'management-notices',
      label: labels.managementNoticesCard,
      value: unreadManagementNoticesCount,
    },
    {
      id: 'management-messages',
      label: labels.managementMessagesCard,
      value: activeManagementMessagesCount,
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

        <DashboardSectionSwitcher cards={summaryCards}>
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
              {labels.studentsList}
            </h2>

            {students.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhum aluno vinculado.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-900/30 text-blue-400 border border-blue-500/20">
                            ALUNO
                          </span>

                          <span className="text-sm font-bold text-[#f5f5f5] truncate">
                            {student.name}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[#a1a1a1] mb-3">
                        Professor:{' '}
                        <span className="text-[#D4A373]">
                          {student.user?.name || 'Não vinculado'}
                        </span>
                      </p>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-[10px] text-emerald-400">
                          Vinculado
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isGestor && (
            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-[#f5f5f5]">
                    {labels.awaitingAssignmentList}
                  </h2>

                  <p className="text-sm text-[#a1a1a1] mt-1">
                    Pendência de ação: vincular professor responsável e preencher os dias contratados por mês.
                  </p>
                </div>

                <a
                  href="/dashboard/gestor/vincular-alunos"
                  className="inline-flex items-center justify-center bg-[#D4A373] text-[#0a0a0a] font-semibold rounded-lg px-4 py-2 text-xs hover:bg-[#c49563] transition"
                >
                  Ir para vincular alunos
                </a>
              </div>

              {studentsAwaitingAssignment.length === 0 ? (
                <p className="text-[#a1a1a1]">
                  Nenhum aluno aguardando vínculo no momento.
                </p>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                  {studentsAwaitingAssignment.map((student) => {
                    const hasProfessorLinked =
                      Boolean(student.userId) && professorIds.includes(student.userId);

                    const hasContractedDays =
                      typeof student.contractedTrainingDaysPerMonth === 'number' &&
                      student.contractedTrainingDaysPerMonth > 0;

                    return (
                      <div
                        key={student.id}
                        className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
                      >
                        <div className="p-4">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-900/30 text-amber-400 border border-amber-500/20">
                                AÇÃO
                              </span>

                              <span className="text-sm font-bold text-[#f5f5f5] truncate">
                                {student.name}
                              </span>
                            </div>

                            <span className="text-[10px] text-[#a1a1a1] shrink-0">
                              Bioimpedância concluída
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <div>
                              <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                                E-mail
                              </p>
                              <p className="text-xs text-[#a1a1a1] truncate" title={student.email || '-'}>
                                {student.email || '-'}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                                Professor
                              </p>
                              <p className={"text-xs " + (hasProfessorLinked ? "text-emerald-400" : "text-amber-400")}>
                                {hasProfessorLinked ? student.user?.name || 'Vinculado' : 'Pendente'}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                                Dias contratados/mês
                              </p>
                              <p className={"text-xs " + (hasContractedDays ? "text-emerald-400" : "text-amber-400")}>
                                {hasContractedDays ? student.contractedTrainingDaysPerMonth : 'Pendente'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <p className="text-xs text-[#a1a1a1]">
                              A pendência some automaticamente quando o professor for vinculado e os dias contratados forem preenchidos.
                            </p>

                            <a
                              href="/dashboard/gestor/vincular-alunos"
                              className="inline-flex items-center justify-center text-[#D4A373] hover:text-[#c49563] text-xs px-3 py-1.5 rounded-lg hover:bg-[#D4A373]/5 transition"
                            >
                              Resolver vínculo
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
              {labels.pendingWorkoutsList}
            </h2>

            {pendingWorkouts.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhum treino pendente no momento.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {pendingWorkouts.map((workout) => (
                  <div
                    key={workout.id}
                    className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-900/30 text-amber-400 border border-amber-500/20">
                            TREINO
                          </span>

                          <span className="text-sm font-bold text-[#f5f5f5] truncate">
                            {workout.student?.name || 'Aluno'}
                          </span>
                        </div>

                        <span className="text-[10px] text-[#a1a1a1] shrink-0">
                          {formatDate(workout.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-[#f5f5f5] mb-3">
                        Treino pendente de análise.
                      </p>

                      <p className="text-xs text-[#a1a1a1] mb-3">
                        Professor:{' '}
                        <span className="text-[#D4A373]">
                          {workout.student?.user?.name || 'Não vinculado'}
                        </span>
                      </p>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-[10px] text-amber-400">
                          Pendente
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
              {labels.unansweredQuestionsList}
            </h2>

            <DashboardConversationList
              conversations={unansweredQuestionConversationItems}
              currentUserId={userId}
              currentRole={isGestor ? 'GESTOR' : 'TEACHER'}
              emptyMessage="Nenhuma dúvida aguardando resposta."
              allowReply={isTeacher}
            />
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
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {pendingNoticeItems.map((item) => (
                  <div
                    key={`${item.notice.id}-${item.student.id}`}
                    className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-900/30 text-amber-400 border border-amber-500/20">
                            AVISO
                          </span>

                          <span className="text-sm font-bold text-[#f5f5f5] truncate">
                            {item.notice.author?.name || 'Gestão'}
                          </span>
                        </div>

                        <span className="text-[10px] text-[#a1a1a1] shrink-0">
                          {formatDate(item.notice.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-[#f5f5f5] mb-3 whitespace-pre-wrap">
                        {item.notice.title || 'Aviso'}
                      </p>

                      <p className="text-xs text-[#a1a1a1] mb-2">
                        Para:{' '}
                        <span className="text-[#D4A373]">
                          Aluno: {item.student.name}
                        </span>
                      </p>

                      <p className="text-xs text-[#a1a1a1] mb-3">
                        Destino original:{' '}
                        <span className="text-[#D4A373]">
                          {getNoticeTargetLabel(item.notice)}
                        </span>
                      </p>

                      <div className="flex justify-between items-center gap-4">
                        <span className="text-[10px] text-amber-400">
                          Pendente
                        </span>
                      </div>
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

            <DashboardConversationList
              conversations={managementConversationItems}
              currentUserId={userId}
              currentRole={isGestor ? 'GESTOR' : 'TEACHER'}
              emptyMessage="Nenhuma mensagem da gestão."
            />
          </div>
        </DashboardSectionSwitcher>
      </div>
    </div>
  );
}
