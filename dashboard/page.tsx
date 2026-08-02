import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import DashboardConversationList from '@/components/DashboardConversationList';
import ManagementNoticeModalList from '@/components/ManagementNoticeModalList';
import DashboardAutoRefresh from '@/components/DashboardAutoRefresh';
import DashboardSectionSwitcher from '@/components/DashboardSectionSwitcher';
import TrialContinuationDashboardShortcut from '@/components/gestor/TrialContinuationDashboardShortcut';
import ProfilePhotoEditor from '@/components/ProfilePhotoEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function DashboardPage({ searchParams }: { searchParams?: { conversationId?: string } }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  if (!sessionUser?.id) {
    redirect('/auth/signin');
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
      image: true,
    },
  });

  const profileImageUrl = currentUser?.image || sessionUser?.image || null;

  function getStudentInitials(name?: string | null): string {
    const parts = String(name || 'Aluno')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const first = parts[0]?.[0] || 'A';
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';

    return `${first}${second}`.toUpperCase();
  }

  function getStudentProfileHref(studentId: string): string {
    return `/dashboard/students/${encodeURIComponent(studentId)}`;
  }

  const labels = {
    studentsCard: isGestor ? 'Todos os alunos' : 'Meus alunos',

    awaitingAssignmentCard: 'Alunos aguardando vínculo',

    missingCurrentWeekWorkoutsCard: isGestor
      ? 'Alunos sem treino da semana atual'
      : 'Meus alunos sem treino da semana atual',

    missingNextWeekWorkoutsCard: isGestor
      ? 'Alunos sem pré-planejamento da próxima semana'
      : 'Meus alunos sem pré-planejamento da próxima semana',

    pendingWorkoutsCard: isGestor
      ? 'Treinos pendentes de todos os alunos'
      : 'Treinos pendentes dos meus alunos',

    unansweredQuestionsCard: isGestor
      ? 'Dúvidas sem resposta de todos os alunos'
      : 'Dúvidas sem resposta dos meus alunos',

    careEventsCard: isGestor
      ? 'Eventos de cuidado pendentes'
      : 'Eventos de cuidado dos meus alunos',

    trainingPreferencesCard: isGestor
      ? 'Preferências de treino pendentes'
      : 'Preferências pendentes dos meus alunos',

    pendingNoticesCard: isGestor
      ? 'Avisos pendentes de todos os alunos'
      : 'Avisos pendentes dos meus alunos',

    managementNoticesCard: isGestor
      ? 'Avisos da gestão de todos os professores'
      : 'Avisos da gestão direcionado a mim',

    managementMessagesCard: isGestor
      ? 'Mensagens da gestão todos os alunos e professores'
      : 'Conversas com a gestão',

    pendingWorkoutsList: isGestor
      ? 'Treinos Pendentes de todos os alunos'
      : 'Treinos Pendentes dos meus alunos',

    pendingNoticesList: isGestor
      ? 'Avisos com leitura pendente de todos os alunos'
      : 'Avisos com leitura pendente dos meus alunos',

    unansweredQuestionsList: isGestor
      ? 'Dúvidas sem resposta de todos os alunos'
      : 'Dúvidas sem resposta dos meus alunos',

    careEventsList: isGestor
      ? 'Eventos de cuidado de todos os alunos'
      : 'Eventos de cuidado dos meus alunos',

    trainingPreferencesList: isGestor
      ? 'Preferências de treino de todos os alunos'
      : 'Preferências de treino dos meus alunos',

    managementNoticesList: isGestor
      ? 'Avisos da gestão de todos os professores'
      : 'Avisos da gestão direcionado para mim',

    managementMessagesList: isGestor
      ? 'Mensagens da gestão todos os alunos e professores'
      : 'Conversas com a gestão',

    studentsList: isGestor ? 'Todos os alunos' : 'Meus alunos',

    awaitingAssignmentList: 'Alunos aguardando vínculo',

    missingCurrentWeekWorkoutsList: isGestor
      ? 'Alunos sem treino da semana atual'
      : 'Meus alunos sem treino da semana atual',

    missingNextWeekWorkoutsList: isGestor
      ? 'Alunos sem pré-planejamento da próxima semana'
      : 'Meus alunos sem pré-planejamento da próxima semana',
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

  function getWeeklyWorkoutLimit(contractedTrainingDaysPerMonth?: number | null): number | null {
    const contracted = Number(contractedTrainingDaysPerMonth || 0);

    if (!Number.isFinite(contracted) || contracted <= 0) {
      return null;
    }

    if (contracted <= 4) return 1;
    if (contracted <= 8) return 2;
    if (contracted <= 16) return 3;

    return Math.ceil(contracted / 4);
  }

  function getWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);

    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(0, 0, 0, 0);

    return { startOfWeek, endOfWeek };
  }

  function getNextWeekRange(referenceDate: Date): { startOfWeek: Date; endOfWeek: Date } {
    const currentWeek = getWeekRange(referenceDate);
    const startOfWeek = new Date(currentWeek.endOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(0, 0, 0, 0);

    return { startOfWeek, endOfWeek };
  }

  function formatDateOnly(date: Date): string {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function getWeekdayInSaoPaulo(referenceDate: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(referenceDate);
  }

  function formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const students = await prisma.student.findMany({
    where: isTeacher
      ? {
          OR: [
            { userId },
            {
              contracts: {
                some: {
                  professorId: userId,
                  status: {
                    notIn: ['CANCELADO', 'CANCELLED', 'FINALIZADO', 'FINALIZED', 'INATIVO', 'ENCERRADO'],
                  },
                },
              },
            },
          ],
        }
      : {},
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      active: true,
      userId: true,
      userAuthId: true,
      onboardingCompleto: true,
      contractedTrainingDaysPerMonth: true,
      commercialStatus: true,
      createdAt: true,
      contracts: {
        orderBy: [
          { startDate: 'asc' },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          professorId: true,
          startDate: true,
          endDate: true,
          status: true,
          commercialStatus: true,
          workoutsPerWeek: true,
          workoutsPerMonth: true,
          totalContractedWorkouts: true,
          createdAt: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          role: true,
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

  function getCommercialStatus(student: { commercialStatus?: string | null }) {
    return String(student.commercialStatus || 'SEM_CONTRATO_ATIVO').toUpperCase();
  }

  function isUsableProfessorContract(contract: {
    professorId?: string | null;
    status?: string | null;
  }): boolean {
    const status = String(contract.status || '').toUpperCase();

    return !['CANCELADO', 'CANCELLED', 'FINALIZADO', 'FINALIZED', 'INATIVO', 'ENCERRADO'].includes(status);
  }

  function getLinkedProfessorIds(student: (typeof students)[number]): string[] {
    const linkedProfessorIds = new Set<string>();

    if (student.userId) {
      linkedProfessorIds.add(student.userId);
    }

    for (const contract of student.contracts || []) {
      if (contract.professorId && isUsableProfessorContract(contract)) {
        linkedProfessorIds.add(contract.professorId);
      }
    }

    return Array.from(linkedProfessorIds);
  }

  function getDashboardWeeklyWorkoutLimit(student: { contractedTrainingDaysPerMonth?: number | null }) {
    /*
     * O dashboard precisa funcionar também para aluno recém-criado/teste,
     * quando o contrato/dias por mês ainda não foram preenchidos.
     * Nesses casos, usamos 1 treino como mínimo operacional apenas para
     * o contador/lista de "sem treino" não ficar zerado indevidamente.
     */
    return getWeeklyWorkoutLimit(student.contractedTrainingDaysPerMonth) || 1;
  }

  const studentsAwaitingAssignment = isGestor
    ? students.filter((student) => {
        if (student.active === false) return false;

        const hasProfessorLinked = getLinkedProfessorIds(student).some((professorId) =>
          professorIds.includes(professorId)
        );

        /*
         * Regra ajustada:
         * se o aluno foi criado e ainda não tem professor vinculado, a gestão
         * precisa enxergar no card "Alunos aguardando vínculo", mesmo que o
         * status comercial ainda não tenha sido preenchido.
         */
        return !hasProfessorLinked;
      })
    : [];

  const currentWorkoutWeek = getWeekRange(new Date());
  const currentWorkoutWeekEndDisplay = new Date(currentWorkoutWeek.endOfWeek.getTime() - 1);
  const currentWorkoutWeekLabel = `${formatDateOnly(currentWorkoutWeek.startOfWeek)} a ${formatDateOnly(currentWorkoutWeekEndDisplay)}`;

  const nextWorkoutWeek = getNextWeekRange(new Date());
  const nextWorkoutWeekEndDisplay = new Date(nextWorkoutWeek.endOfWeek.getTime() - 1);
  const nextWorkoutWeekLabel = `${formatDateOnly(nextWorkoutWeek.startOfWeek)} a ${formatDateOnly(nextWorkoutWeekEndDisplay)}`;

  const studentsEligibleForWeeklyWorkout = students.filter((student) => {
    if (student.active === false) return false;

    /*
     * Regra-base do controle semanal:
     * aluno ativo + professor vinculado entra no radar operacional.
     *
     * A elegibilidade de cada semana é validada separadamente logo abaixo,
     * usando o início e o fim da experiência/contrato. Assim, um aluno com
     * experiência agendada para a próxima semana não aparece como pendência
     * da semana atual.
     */
    const linkedProfessorIds = getLinkedProfessorIds(student);
    const hasProfessorLinked = isTeacher
      ? linkedProfessorIds.includes(userId)
      : linkedProfessorIds.some((professorId) => professorIds.includes(professorId));

    return hasProfessorLinked;
  });

  function toLocalDateOnly(value: Date | string): Date | null {
    const rawDate = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(rawDate.getTime())) {
      return null;
    }

    /*
     * Datas de contrato são tratadas como datas civis, sem deslocamento de fuso.
     * Usar os componentes UTC evita transformar 13/07 em 12/07 no horário de
     * Brasília quando o banco devolve meia-noite UTC.
     */
    return new Date(
      rawDate.getUTCFullYear(),
      rawDate.getUTCMonth(),
      rawDate.getUTCDate(),
      12,
      0,
      0,
      0
    );
  }

  function getStudentContractForWeek(
    student: (typeof students)[number],
    week: { startOfWeek: Date; endOfWeek: Date }
  ) {
    const contracts = student.contracts || [];

    return contracts.find((contract) => {
      const status = String(contract.status || '').toUpperCase();

      if (['CANCELADO', 'CANCELLED', 'INATIVO', 'ENCERRADO'].includes(status)) {
        return false;
      }

      const contractStart = toLocalDateOnly(contract.startDate);
      const contractEnd = toLocalDateOnly(contract.endDate);

      if (!contractStart || !contractEnd) {
        return false;
      }

      /*
       * O fim da semana é exclusivo.
       * O fim do contrato é considerado inclusivo.
       */
      return (
        contractStart.getTime() < week.endOfWeek.getTime() &&
        contractEnd.getTime() >= week.startOfWeek.getTime()
      );
    }) || null;
  }

  function getStudentsEligibleForWeek(
    week: { startOfWeek: Date; endOfWeek: Date }
  ) {
    return studentsEligibleForWeeklyWorkout.filter((student) => {
      const contracts = student.contracts || [];

      /*
       * Mantém o comportamento operacional anterior para cadastros antigos ou
       * de teste que ainda não possuem contrato registrado: aluno ativo e com
       * professor continua visível.
       *
       * Quando existe contrato/experiência, a semana precisa estar dentro do
       * período válido. Isso impede que experiência agendada para a próxima
       * segunda-feira gere pendência indevida na semana atual.
       */
      if (contracts.length === 0) {
        return true;
      }

      return Boolean(getStudentContractForWeek(student, week));
    });
  }

  const studentsEligibleForCurrentWeek = getStudentsEligibleForWeek(currentWorkoutWeek);
  const studentsEligibleForNextWeek = getStudentsEligibleForWeek(nextWorkoutWeek);

  const eligibleStudentIds = Array.from(
    new Set(
      [
        ...studentsEligibleForCurrentWeek,
        ...studentsEligibleForNextWeek,
      ].map((student) => student.id)
    )
  );

  const workoutPlansInControlWeeks = eligibleStudentIds.length > 0
    ? await prisma.workoutPlan.findMany({
        where: {
          studentId: {
            in: eligibleStudentIds,
          },
          date: {
            gte: currentWorkoutWeek.startOfWeek,
            lt: nextWorkoutWeek.endOfWeek,
          },
        },
        select: {
          id: true,
          studentId: true,
          date: true,
        },
      })
    : [];

  function getWorkoutPlansCountByStudentForWeek(week: { startOfWeek: Date; endOfWeek: Date }) {
    const countByStudent = new Map<string, number>();

    workoutPlansInControlWeeks.forEach((plan) => {
      if (!plan.date) return;

      if (plan.date >= week.startOfWeek && plan.date < week.endOfWeek) {
        countByStudent.set(
          plan.studentId,
          (countByStudent.get(plan.studentId) || 0) + 1
        );
      }
    });

    return countByStudent;
  }

  function buildStudentsMissingWeeklyWorkouts(
    eligibleStudents: typeof studentsEligibleForWeeklyWorkout,
    countByStudent: Map<string, number>,
    weekLabel: string,
    weekStartDateInput: string
  ) {
    return eligibleStudents
      .map((student) => {
        const weeklyLimit = getDashboardWeeklyWorkoutLimit(student);
        const createdCount = countByStudent.get(student.id) || 0;
        const missingCount = Math.max(weeklyLimit - createdCount, 0);

        return {
          student,
          weeklyLimit,
          createdCount,
          missingCount,
          weekLabel,
          weekStartDateInput,
        };
      })
      .filter((item) => item.missingCount > 0);
  }

  const currentWeekWorkoutPlansCountByStudent = getWorkoutPlansCountByStudentForWeek(currentWorkoutWeek);
  const nextWeekWorkoutPlansCountByStudent = getWorkoutPlansCountByStudentForWeek(nextWorkoutWeek);

  const studentsMissingCurrentWeekWorkouts = buildStudentsMissingWeeklyWorkouts(
    studentsEligibleForCurrentWeek,
    currentWeekWorkoutPlansCountByStudent,
    currentWorkoutWeekLabel,
    formatDateInput(currentWorkoutWeek.startOfWeek)
  );

  const studentsMissingNextWeekWorkouts = buildStudentsMissingWeeklyWorkouts(
    studentsEligibleForNextWeek,
    nextWeekWorkoutPlansCountByStudent,
    nextWorkoutWeekLabel,
    formatDateInput(nextWorkoutWeek.startOfWeek)
  );

  const isWorkoutPlanningDeadlineToday = getWeekdayInSaoPaulo(new Date()) === 'Sat';
  const workoutPlanningDeadlineStatusLabel = isWorkoutPlanningDeadlineToday
    ? 'Prazo vence hoje'
    : 'Prazo final: sábado';

  // Um treino só permanece pendente enquanto a semana dele ainda está aberta
  // para conclusão (segunda a sexta). Treinos de semanas anteriores continuam
  // visíveis no histórico, mas não entram mais no contador/lista de pendências.
  const currentWeekdayInSaoPaulo = getWeekdayInSaoPaulo(new Date());
  const isWorkoutCompletionWindowOpen = !['Sat', 'Sun'].includes(currentWeekdayInSaoPaulo);

  const pendingWorkouts = isWorkoutCompletionWindowOpen
    ? await prisma.workout.findMany({
        where: {
          status: 'PENDENTE',
          date: {
            gte: currentWorkoutWeek.startOfWeek,
            lt: currentWorkoutWeek.endOfWeek,
          },
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
      })
    : [];

  const openCareEvents = await prisma.studentCareEvent.findMany({
    where: {
      status: {
        in: ['ABERTO', 'REQUER_REVISAO', 'EM_REVISAO'],
      },
      ...(isTeacher
        ? {
            OR: [
              { professorId: userId },
              {
                student: {
                  userId,
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      eventType: true,
      severity: true,
      status: true,
      title: true,
      description: true,
      professorMessage: true,
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
      professor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
    ],
    take: 20,
  });

  const unansweredQuestions = await prisma.question.findMany({
    where: isTeacher
      ? {
          parentId: null,
          senderRole: 'STUDENT',
          OR: [
            {
              teacherId: userId,
            },
            {
              teacherId: {
                not: null,
              },
              studentId: {
                in: myStudentIds,
              },
            },
          ],
        }
      : {
          id: {
            in: [],
          },
        },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      senderRole: true,
      content: true,
      imageUrl: true,
      videoUrl: true,
      documentUrl: true,
      documentName: true,
      documentMimeType: true,
      attachments: { orderBy: { createdAt: "asc" } },
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
          imageUrl: true,
          videoUrl: true,
          documentUrl: true,
          documentName: true,
          documentMimeType: true,
          attachments: { orderBy: { createdAt: "asc" } },
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

  const now = new Date();

  const pendingTrainingPreferences = await prisma.studentTrainingPreference.findMany({
    where: {
      status: 'ACTIVE',
      currentWeekAction: 'PENDING',
      ...(isTeacher
        ? {
            OR: [
              { professorId: userId },
              { student: { userId } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      studentId: true,
      professorId: true,
      sourceConversationId: true,
      source: true,
      category: true,
      summary: true,
      originalMessage: true,
      relatedWorkoutId: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          name: true,
          image: true,
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

  const adjustmentStudentIds = Array.from(
    new Set(pendingTrainingPreferences.map((preference) => preference.studentId))
  );
  const adjustmentWeek = getWeekRange(now);
  const pendingAdjustmentWorkouts = adjustmentStudentIds.length
    ? await prisma.workout.findMany({
        where: {
          studentId: { in: adjustmentStudentIds },
          status: 'PENDENTE',
          date: {
            gte: adjustmentWeek.startOfWeek,
            lt: adjustmentWeek.endOfWeek,
          },
        },
        select: {
          id: true,
          studentId: true,
          workoutPlanId: true,
          date: true,
          status: true,
          workoutPlan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          date: 'asc',
        },
      })
    : [];

  const pendingAdjustmentWorkoutsByStudentId = new Map<
    string,
    typeof pendingAdjustmentWorkouts
  >();

  for (const workout of pendingAdjustmentWorkouts) {
    const current = pendingAdjustmentWorkoutsByStudentId.get(workout.studentId) || [];
    current.push(workout);
    pendingAdjustmentWorkoutsByStudentId.set(workout.studentId, current);
  }

  const pendingPreferenceByConversationId = new Map<
    string,
    (typeof pendingTrainingPreferences)[number]
  >();

  for (const preference of pendingTrainingPreferences) {
    if (!pendingPreferenceByConversationId.has(preference.sourceConversationId)) {
      pendingPreferenceByConversationId.set(preference.sourceConversationId, preference);
    }
  }

  const notices = await prisma.notice.findMany({
    where: {
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
    },
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
   *    - aparece para a gestão;
   *    - aparece para o professor responsável, se o aluno estiver vinculado a ele;
   *    - conta como pendente enquanto o aluno não tiver lido.
   *
   * 2. Aviso para todos os alunos:
   *    - no gestor, conta 1 pendência para cada aluno que ainda não leu;
   *    - no professor, conta 1 pendência para cada aluno dele que ainda não leu;
   *    - não conta para alunos criados depois do aviso.
   */
  const pendingNoticeItems = notices.flatMap((notice) => {
    const targetRole = normalizeRole(notice.targetRole);

    if (targetRole !== 'STUDENT') {
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
     * Este card/lista mede somente avisos da gestão enviados aos professores.
     * Avisos direcionados para a própria gestão não entram aqui, para não inflar
     * o contador "Avisos da gestão de todos os professores".
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
    const targetRole = normalizeRole(notice.targetRole);
    const readProfessorIds = new Set(
      notice.reads
        .map((read) => read.professorId)
        .filter((professorId): professorId is string => Boolean(professorId))
    );

    if (targetRole !== 'TEACHER') {
      return false;
    }

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
            OR: [
              {
                senderRole: 'GESTOR',
                teacherId: userId,
              },
              {
                senderRole: 'TEACHER',
                teacherId: userId,
                studentId: null,
              },
            ],
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

  const unansweredQuestionConversationItems = questionsWithoutAnswer.map((question) => {
    const preference = pendingPreferenceByConversationId.get(question.id) || null;
    const relatedPendingWorkouts = preference
      ? pendingAdjustmentWorkoutsByStudentId.get(preference.studentId) || []
      : [];

    return {
    id: question.id,
    studentId: question.studentId || null,
    teacherId: question.teacherId || (isTeacher ? userId : null),
    content: question.content,
    imageUrl: question.imageUrl || null,
    videoUrl: question.videoUrl || null,
    documentUrl: question.documentUrl || null,
    documentName: question.documentName || null,
    documentMimeType: question.documentMimeType || null,
    attachments: (question.attachments || []).map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      url: attachment.url,
      name: attachment.name || null,
      mimeType: attachment.mimeType || null,
      purpose: attachment.purpose || null,
      videoReviewSummary: attachment.videoReviewSummary || null,
      videoReviewedAt: attachment.videoReviewedAt
        ? attachment.videoReviewedAt.toISOString()
        : null,
    })),
    senderRole: question.senderRole || 'STUDENT',
    createdAt: question.createdAt.toISOString(),
    resolvedAt: question.resolvedAt ? question.resolvedAt.toISOString() : null,
    answeredById: question.answeredById || null,
    openedById: question.answeredById || null,
    authorName: question.student?.name || 'Aluno',
    targetLabel: isTeacher
      ? `Professor: ${userName}`
      : question.teacher?.name
        ? `Professor: ${question.teacher.name}`
        : 'Professor',
    adjustmentRequest: preference
      ? {
          preferenceId: preference.id,
          category: preference.category,
          summary: preference.summary,
          originalMessage: preference.originalMessage,
          pendingWorkouts: relatedPendingWorkouts.map((workout) => ({
            workoutId: workout.id,
            workoutPlanId: workout.workoutPlanId || null,
            name: workout.workoutPlan?.name || 'Treino pendente',
            date: workout.date.toISOString(),
            status: workout.status,
          })),
        }
      : null,
    children: (question.children || []).map((reply) => ({
      id: reply.id,
      studentId: reply.studentId || question.studentId || null,
      teacherId: reply.teacherId || question.teacherId || (isTeacher ? userId : null),
      content: reply.content,
      imageUrl: reply.imageUrl || null,
      videoUrl: reply.videoUrl || null,
      documentUrl: reply.documentUrl || null,
      documentName: reply.documentName || null,
      documentMimeType: reply.documentMimeType || null,
      attachments: (reply.attachments || []).map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        url: attachment.url,
        name: attachment.name || null,
        mimeType: attachment.mimeType || null,
        purpose: attachment.purpose || null,
        videoReviewSummary: attachment.videoReviewSummary || null,
        videoReviewedAt: attachment.videoReviewedAt
          ? attachment.videoReviewedAt.toISOString()
          : null,
      })),
      senderRole: reply.senderRole || 'TEACHER',
      createdAt: reply.createdAt.toISOString(),
      resolvedAt: reply.resolvedAt ? reply.resolvedAt.toISOString() : null,
      authorName:
        reply.answeredBy?.name ||
        reply.teacher?.name ||
        reply.student?.name ||
        'Usuário',
    })),
    };
  });

  function getNoticeTargetLabel(notice: (typeof notices)[number]): string {
    const targetRole = normalizeRole(notice.targetRole);

    if (targetRole === 'GESTOR' || targetRole === 'ADMIN') {
      return 'Gestão';
    }

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
    imageUrl: message.imageUrl || null,
    videoUrl: message.videoUrl || null,
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
      imageUrl: reply.imageUrl || null,
      videoUrl: reply.videoUrl || null,
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
    const targetRole = normalizeRole(notice.targetRole);
    const readProfessorIds = new Set(
      notice.reads
        .map((read) => read.professorId)
        .filter((professorId): professorId is string => Boolean(professorId))
    );

    if (targetRole !== 'TEACHER') {
      return {
        readByCurrentUser: false,
        readStatusLabel: 'Não aplicável',
        readStatusVariant: 'neutral',
        readStatusDescription: 'Este aviso não é direcionado a professores.',
      };
    }

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

  function getCareEventTypeLabel(type?: string | null): string {
    const normalized = String(type || '').toUpperCase();

    const labelsByType: Record<string, string> = {
      FALTA_TEMPO: 'Falta de tempo',
      EXERCICIO_DIFICIL: 'Exercício difícil',
      DOR_DESCONFORTO: 'Dor/desconforto',
      RELATO_DOR_DUVIDA: 'Relato de dor no chat/dúvidas',
      NAO_ENTENDI: 'Não entendi',
      DESMOTIVACAO: 'Desmotivação',
      BAIXA_ADERENCIA: 'Baixa aderência',
      OUTRO: 'Outro motivo',
    };

    return labelsByType[normalized] || normalized || 'Cuidado do aluno';
  }

  function getCareEventStatusLabel(status?: string | null): string {
    const normalized = String(status || '').toUpperCase();

    const labelsByStatus: Record<string, string> = {
      ABERTO: 'Aberto',
      REQUER_REVISAO: 'Requer revisão',
      EM_REVISAO: 'Em revisão',
      RESOLVIDO: 'Resolvido',
    };

    return labelsByStatus[normalized] || normalized || 'Aberto';
  }

  function getCareEventSeverityClass(severity?: string | null): string {
    const normalized = String(severity || '').toUpperCase();

    if (normalized === 'CUIDADO') {
      return 'bg-red-900/30 text-red-400 border border-red-500/20';
    }

    if (normalized === 'REVISAO') {
      return 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/20';
    }

    return 'bg-blue-900/30 text-blue-400 border border-blue-500/20';
  }

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
      id: 'missing-current-week-workouts',
      label: labels.missingCurrentWeekWorkoutsCard,
      value: studentsMissingCurrentWeekWorkouts.length,
    },
    {
      id: 'missing-next-week-workouts',
      label: labels.missingNextWeekWorkoutsCard,
      value: studentsMissingNextWeekWorkouts.length,
      tone:
        isWorkoutPlanningDeadlineToday && studentsMissingNextWeekWorkouts.length > 0
          ? 'danger'
          : studentsMissingNextWeekWorkouts.length > 0
            ? 'warning'
            : 'default',
    },
    {
      id: 'pending-workouts',
      label: labels.pendingWorkoutsCard,
      value: pendingWorkouts.length,
    },
    ...(isTeacher
      ? [
          {
            id: 'unanswered-questions',
            label: labels.unansweredQuestionsCard,
            value: questionsWithoutAnswer.length,
          },
        ]
      : []),
    {
      id: 'care-events',
      label: labels.careEventsCard,
      value: openCareEvents.length,
    },
    {
      id: 'training-preferences',
      label: labels.trainingPreferencesCard,
      value: pendingTrainingPreferences.length,
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-3 sm:p-4 md:p-8">
      <DashboardAutoRefresh />

      <div className="max-w-7xl mx-auto space-y-5 md:space-y-8">
        <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <ProfilePhotoEditor
                name={userName}
                initialImageUrl={profileImageUrl}
                size="lg"
              />

              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#00A19C]">
                  {isGestor ? 'Gestão' : isTeacher ? 'Professor' : 'Painel'}
                </p>
                <h1 className="mt-1 text-2xl md:text-3xl font-semibold text-[#f5f5f5]">
                  Olá, {userName}
                </h1>

                <p className="mt-2 text-[#a1a1a1]">
                  Bem-vindo ao painel administrativo. Aqui está o resumo das atividades pendentes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {isGestor && <TrialContinuationDashboardShortcut />}

        {(isGestor || isTeacher) && (
          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#00A19C]">
                  Evolução dos alunos
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#f5f5f5]">
                  Feedbacks de 20 em 20 treinos executados
                </h2>
                <p className="mt-1 text-sm text-[#a1a1a1]">
                  Acompanhe alunos que bateram marcos de 20, 40, 60 treinos e envie uma devolutiva humanizada.
                </p>
              </div>

              <a
                href="/dashboard/evolucao-alunos"
                className="inline-flex items-center justify-center rounded-lg bg-[#00A19C] px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87] transition"
              >
                Abrir evolução
              </a>
            </div>
          </div>
        )}

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
                  <a
                    key={student.id}
                    href={getStudentProfileHref(student.id)}
                    className="group block bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden hover:border-[#00A19C]/40 hover:bg-[#141414] transition"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#00A19C]/30 bg-[#1a1a1a] flex items-center justify-center">
                            {student.image ? (
                              <img
                                src={student.image}
                                alt={student.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-sm font-bold text-[#00A19C]">
                                {getStudentInitials(student.name)}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-900/30 text-blue-400 border border-blue-500/20">
                                ALUNO
                              </span>

                              <span className="text-sm font-bold text-[#f5f5f5] truncate group-hover:text-[#00A19C] transition">
                                {student.name}
                              </span>
                            </div>

                            <p className="text-xs text-[#a1a1a1]">
                              Professor:{' '}
                              <span className="text-[#00A19C]">
                                {student.user?.name || 'Não vinculado'}
                              </span>
                            </p>

                            <p className="text-[10px] text-[#6b6b6b] mt-1">
                              Clique para abrir a ficha do aluno, dados pessoais e resumo de transição.
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] text-[#00A19C] opacity-0 group-hover:opacity-100 transition shrink-0">
                          Ver ficha →
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="text-[10px] text-emerald-400">
                          {student.user?.name ? 'Vinculado' : 'Não vinculado'}
                        </span>

                        <span className="text-[10px] text-[#6b6b6b]">
                          Status: {getCommercialStatus(student).replaceAll('_', ' ').toLowerCase()}
                        </span>

                        {student.contractedTrainingDaysPerMonth ? (
                          <span className="text-[10px] text-[#6b6b6b]">
                            {student.contractedTrainingDaysPerMonth} treino(s)/mês
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </a>
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
                  className="inline-flex items-center justify-center bg-[#00A19C] text-[#0a0a0a] font-semibold rounded-lg px-4 py-2 text-xs hover:bg-[#008B87] transition"
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
                              className="inline-flex items-center justify-center text-[#00A19C] hover:text-[#008B87] text-xs px-3 py-1.5 rounded-lg hover:bg-[#00A19C]/5 transition"
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
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#f5f5f5]">
                  {labels.missingCurrentWeekWorkoutsList}
                </h2>

                <p className="text-sm text-[#a1a1a1] mt-1">
                  Semana de referência: {currentWorkoutWeekLabel}. Pendência urgente: aluno ativo, com professor vinculado e elegível para treinar nesta semana, mas ainda sem a quantidade prevista de treinos.
                </p>
              </div>
            </div>

            {studentsMissingCurrentWeekWorkouts.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhum aluno com treino da semana atual pendente.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {studentsMissingCurrentWeekWorkouts.map((item) => (
                  <div
                    key={item.student.id}
                    className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-900/30 text-amber-400 border border-amber-500/20">
                            TREINO DA SEMANA PENDENTE
                          </span>

                          <span className="text-sm font-bold text-[#f5f5f5] truncate">
                            {item.student.name}
                          </span>
                        </div>

                        <span className="text-[10px] text-amber-400 shrink-0">
                          Pendente(s) {item.missingCount} treino(s)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Professor
                          </p>
                          <p className="text-xs text-[#00A19C] truncate" title={item.student.user?.name || 'Não vinculado'}>
                            {item.student.user?.name || 'Não vinculado'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Meta semanal
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.weeklyLimit} treino(s)
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Criados
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.createdCount}/{item.weeklyLimit}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Semana
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-xs text-[#a1a1a1]">
                          {isGestor ? 'Acompanhe o professor responsável. O aluno sai desta lista quando a quantidade prevista de treinos da semana atual estiver cadastrada.' : 'O aluno sai desta lista quando a quantidade prevista de treinos da semana atual estiver cadastrada. Revise os dados atualizados antes de liberar.'}
                        </p>

                        {isTeacher && (
                          <Link
                            href={{
                              pathname: "/dashboard/montar-treino",
                              query: {
                                studentId: item.student.id,
                                date: item.weekStartDateInput,
                              },
                            }}
                            prefetch={false}
                            className="inline-flex items-center justify-center text-[#00A19C] hover:text-[#008B87] text-xs px-3 py-1.5 rounded-lg hover:bg-[#00A19C]/5 transition"
                          >
                            Montar treino deste aluno
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-[#f5f5f5]">
                    {labels.missingNextWeekWorkoutsList}
                  </h2>

                  <span
                    className={
                      "text-[10px] px-2 py-0.5 rounded-full font-medium " +
                      (isWorkoutPlanningDeadlineToday && studentsMissingNextWeekWorkouts.length > 0
                        ? "bg-red-900/30 text-red-400 border border-red-500/20"
                        : "bg-amber-900/30 text-amber-400 border border-amber-500/20")
                    }
                  >
                    {workoutPlanningDeadlineStatusLabel}
                  </span>
                </div>

                <p className="text-sm text-[#a1a1a1] mt-1">
                  Semana de referência: {nextWorkoutWeekLabel}. Esta lista mostra os alunos que ainda não têm a quantidade completa de treinos pré-planejada para a próxima semana. Pré-planejar ajuda a organizar, mas a liberação final deve considerar os dados mais recentes do aluno.
                </p>

                {isWorkoutPlanningDeadlineToday && studentsMissingNextWeekWorkouts.length > 0 ? (
                  <p className="text-xs text-red-400 mt-2">
                    Hoje é sábado: os professores responsáveis serão alertados por e-mail e aviso se ainda houver pré-planejamento pendente.
                  </p>
                ) : (
                  <p className="text-xs text-amber-400 mt-2">
                    Prazo de pré-planejamento: até sábado, os treinos da próxima semana devem estar preparados para revisão final antes da liberação ao aluno.
                  </p>
                )}
              </div>
            </div>

            {studentsMissingNextWeekWorkouts.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhum aluno com treino da próxima semana pendente.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {studentsMissingNextWeekWorkouts.map((item) => (
                  <div
                    key={item.student.id}
                    className={
                      "bg-[#111111] rounded-xl overflow-hidden border " +
                      (isWorkoutPlanningDeadlineToday
                        ? "border-red-500/20"
                        : "border-[#ffffff10]")
                    }
                  >
                    <div className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={
                              "text-[10px] px-2 py-0.5 rounded-full font-medium " +
                              (isWorkoutPlanningDeadlineToday
                                ? "bg-red-900/30 text-red-400 border border-red-500/20"
                                : "bg-amber-900/30 text-amber-400 border border-amber-500/20")
                            }
                          >
                            {isWorkoutPlanningDeadlineToday ? 'PRAZO HOJE' : 'PRÉ-PLANEJAMENTO PENDENTE'}
                          </span>

                          <span className="text-sm font-bold text-[#f5f5f5] truncate">
                            {item.student.name}
                          </span>
                        </div>

                        <span className={isWorkoutPlanningDeadlineToday ? "text-[10px] text-red-400 shrink-0" : "text-[10px] text-amber-400 shrink-0"}>
                          Pendente(s) {item.missingCount} treino(s)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Professor
                          </p>
                          <p className="text-xs text-[#00A19C] truncate" title={item.student.user?.name || 'Não vinculado'}>
                            {item.student.user?.name || 'Não vinculado'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Meta semanal
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.weeklyLimit} treino(s)
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Criados
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.createdCount}/{item.weeklyLimit}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide">
                            Semana
                          </p>
                          <p className="text-xs text-[#a1a1a1]">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-xs text-[#a1a1a1]">
                          {isGestor ? 'Acompanhe o professor responsável. O aluno sai desta lista quando a quantidade prevista de treinos da próxima semana estiver pré-planejada.' : 'O aluno sai desta lista quando a quantidade prevista de treinos estiver pré-planejada. Antes da liberação final, revise os dados atualizados do aluno.'}
                        </p>

                        {isTeacher && (
                          <Link
                            href={{
                              pathname: "/dashboard/montar-treino",
                              query: {
                                studentId: item.student.id,
                                date: item.weekStartDateInput,
                              },
                            }}
                            prefetch={false}
                            className="inline-flex items-center justify-center text-[#00A19C] hover:text-[#008B87] text-xs px-3 py-1.5 rounded-lg hover:bg-[#00A19C]/5 transition"
                          >
                            Montar treino deste aluno
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                        <span className="text-[#00A19C]">
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

          {isTeacher && (
            <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
              <h2 className="text-xl font-semibold text-[#f5f5f5] mb-4">
                {labels.unansweredQuestionsList}
              </h2>

              <div id="duvidas-sem-resposta">
              <DashboardConversationList
                conversations={unansweredQuestionConversationItems}
                currentUserId={userId}
                currentRole="TEACHER"
                emptyMessage="Nenhuma dúvida aguardando resposta."
                allowReply={true}
                initialExpandedConversationId={searchParams?.conversationId || null}
              />
              </div>
            </div>
          )}

          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[#f5f5f5] mb-2">
              {labels.careEventsList}
            </h2>

            <p className="text-sm text-[#a1a1a1] mb-4">
              {isGestor
                ? 'A gestão acompanha os sinais de cuidado em aberto, mas quem altera status e resolve é o professor responsável.'
                : 'Revise estes sinais antes de montar, evoluir ou liberar a próxima semana. Eventos abertos bloqueiam evolução automática da IA.'}
            </p>

            {openCareEvents.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhum alerta de cuidado aberto no momento.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {openCareEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-[#111111] border border-red-500/20 rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + getCareEventSeverityClass(event.severity)}>
                            {event.severity}
                          </span>

                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-900/30 text-blue-400 border border-blue-500/20">
                            {getCareEventStatusLabel(event.status)}
                          </span>

                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#00A19C]/10 text-[#00A19C] border border-[#00A19C]/20">
                            {getCareEventTypeLabel(event.eventType)}
                          </span>
                        </div>

                        <span className="text-[10px] text-[#a1a1a1] shrink-0">
                          {formatDate(event.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-[#f5f5f5] mb-1">
                        {event.student?.name || 'Aluno'}
                      </p>

                      <p className="text-xs text-[#a1a1a1] mb-3">
                        Professor:{' '}
                        <span className="text-[#00A19C]">
                          {event.professor?.name || event.student?.user?.name || 'Não informado'}
                        </span>
                      </p>

                      <p className="text-sm text-[#e5e5e5] mb-3 whitespace-pre-wrap line-clamp-4">
                        {event.professorMessage || event.description || event.title || 'Alerta de cuidado aberto.'}
                      </p>

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-xs text-red-400">
                          Revisar antes de evoluir carga, impacto, volume, complexidade ou intensidade.
                        </p>

                        <a
                          href={(() => {
                            const match = String(event.description || "").match(/Conversa:\s*([0-9a-f-]{36})/i);
                            return match?.[1]
                              ? `/dashboard?conversationId=${encodeURIComponent(match[1])}#duvidas-sem-resposta`
                              : "/dashboard/cuidado-aluno";
                          })()}
                          className="inline-flex items-center justify-center text-[#00A19C] hover:text-[#008B87] text-xs px-3 py-1.5 rounded-lg hover:bg-[#00A19C]/5 transition"
                        >
                          {isTeacher ? 'Abrir conversa e revisar anexos' : 'Visualizar central'}
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#111111] border border-[#ffffff10] rounded-2xl p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#f5f5f5]">
                  {labels.trainingPreferencesList}
                </h2>
                <p className="text-sm text-[#a1a1a1] mt-1">
                  Preferências identificadas no chat ou no relato ao concluir um treino e que ainda aguardam decisão.
                </p>
              </div>

              <a
                href="/dashboard/cuidado-aluno?tab=preferencias"
                className="inline-flex items-center justify-center rounded-lg bg-[#00A19C] px-4 py-2 text-xs font-semibold text-[#0a0a0a] hover:bg-[#008B87] transition"
              >
                Abrir central de preferências
              </a>
            </div>

            {pendingTrainingPreferences.length === 0 ? (
              <p className="text-[#a1a1a1]">
                Nenhuma preferência aguardando decisão.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {pendingTrainingPreferences.map((preference) => (
                  <div
                    key={preference.id}
                    className="bg-[#111111] border border-emerald-500/20 rounded-xl overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#00A19C]/30 bg-[#1a1a1a] flex items-center justify-center">
                            {preference.student.image ? (
                              <img
                                src={preference.student.image}
                                alt={preference.student.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-[#00A19C]">
                                {getStudentInitials(preference.student.name)}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                NOVA PREFERÊNCIA
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#a1a1a1]">
                                {preference.source === 'WORKOUT_COMPLETION' ? 'Relato do treino' : 'Chat'}
                              </span>
                            </div>

                            <p className="text-sm font-bold text-[#f5f5f5]">
                              {preference.student.name}
                            </p>
                            <p className="text-xs text-[#a1a1a1] mt-1">
                              Professor: <span className="text-[#00A19C]">{preference.student.user?.name || 'Não informado'}</span>
                            </p>
                            <p className="text-sm text-[#e5e5e5] mt-3 whitespace-pre-wrap line-clamp-4">
                              {preference.summary}
                            </p>
                            <p className="text-[10px] text-[#6b6b6b] mt-2">
                              Registrada em {formatDate(preference.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 shrink-0">
                          <a
                            href="/dashboard/cuidado-aluno?tab=preferencias"
                            className="inline-flex items-center justify-center text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] text-[#a1a1a1] border border-[#ffffff10] hover:text-white"
                          >
                            Ver na central
                          </a>
                          {isTeacher && (
                            <a
                              href={`/dashboard/conversas?conversationId=${encodeURIComponent(preference.sourceConversationId)}`}
                              className="inline-flex items-center justify-center text-xs px-3 py-2 rounded-lg bg-[#00A19C] text-[#0a0a0a] font-semibold hover:bg-[#008B87]"
                            >
                              Abrir conversa e tratar
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
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
                        <span className="text-[#00A19C]">
                          Aluno: {item.student.name}
                        </span>
                      </p>

                      <p className="text-xs text-[#a1a1a1] mb-3">
                        Destino original:{' '}
                        <span className="text-[#00A19C]">
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
