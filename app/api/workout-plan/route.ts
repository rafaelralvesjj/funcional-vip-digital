import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { sendEmail } from "@/lib/sendEmail";
import { calculateAgeYears } from "@/lib/student-age";

const WORKOUT_STATUS_PRE_PLANNED = "PRE_PLANEJADO";
const WORKOUT_STATUS_PENDING = "PENDENTE";
const WORKOUT_STATUS_NEEDS_REVIEW = "PRECISA_REVISAO";
const WORKOUT_STATUS_COMPLETED = "CONCLUIDO";

function getAppLoginUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app";

  return `${appUrl.replace(/\/$/, "")}/auth/signin`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWeeklyWorkoutLimitFromContract(contract?: {
  workoutsPerWeek?: number | null;
  workoutsPerMonth?: number | null;
} | null): number | null {
  if (!contract) return null;

  const directWeekly = Number(contract.workoutsPerWeek || 0);

  if (Number.isFinite(directWeekly) && directWeekly > 0) {
    return directWeekly;
  }

  const monthly = Number(contract.workoutsPerMonth || 0);

  if (!Number.isFinite(monthly) || monthly <= 0) {
    return null;
  }

  if (monthly <= 4) return 1;
  if (monthly <= 8) return 2;
  if (monthly <= 12) return 3;
  if (monthly <= 16) return 4;

  return 5;
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

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isFutureWeek(startOfWeek: Date): boolean {
  const currentWeek = getWeekRange(new Date());

  return startOfWeek.getTime() > currentWeek.startOfWeek.getTime();
}

function isUnsafeCurrentWeekPlanningWindow(startOfWeek: Date): boolean {
  const currentWeek = getWeekRange(new Date());
  const todayDay = new Date().getDay();

  return (
    startOfWeek.getTime() === currentWeek.startOfWeek.getTime() &&
    [5, 6, 0].includes(todayDay)
  );
}

function getSafeWindowBlockedPayload() {
  const currentWeek = getWeekRange(new Date());
  const nextWeekStart = currentWeek.endOfWeek;
  const nextWeekEndDisplay = new Date(nextWeekStart);
  nextWeekEndDisplay.setDate(nextWeekStart.getDate() + 6);

  return {
    code: "UNSAFE_START_WINDOW",
    error: "Esta semana já não possui janela segura de execução. O planejamento deve ser direcionado para a próxima semana.",
    message: "O aluno não começa atrasado. Ele começa na primeira janela segura de acompanhamento.",
    nextWeekStart: nextWeekStart.toISOString().slice(0, 10),
    nextWeekLabel: `${formatDatePtBr(nextWeekStart)} a ${formatDatePtBr(nextWeekEndDisplay)}`,
  };
}


function isWorkoutReleasedForStudent(status?: string | null): boolean {
  const value = String(status || "").toUpperCase();

  return value !== WORKOUT_STATUS_PRE_PLANNED && value !== WORKOUT_STATUS_NEEDS_REVIEW;
}

function getPreviousWeekRangeFromStart(startOfWeek: Date): { startOfWeek: Date; endOfWeek: Date } {
  const previousStart = new Date(startOfWeek);
  previousStart.setDate(previousStart.getDate() - 7);
  previousStart.setHours(0, 0, 0, 0);

  const previousEnd = new Date(startOfWeek);
  previousEnd.setHours(0, 0, 0, 0);

  return { startOfWeek: previousStart, endOfWeek: previousEnd };
}

function getLatestPlanUpdateDate(plans: Array<{ createdAt: Date; updatedAt?: Date | null }>): Date {
  return plans.reduce((latest, plan) => {
    const dates = [plan.createdAt, plan.updatedAt].filter(Boolean) as Date[];
    const planLatest = dates.reduce((current, item) => (item > current ? item : current), dates[0] || latest);

    return planLatest > latest ? planLatest : latest;
  }, plans[0]?.createdAt || new Date());
}

function normalizeForCareCompare(value?: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPainOrInjuryQuestionSignal(value?: unknown): boolean {
  const text = normalizeForCareCompare(value);

  if (!text) return false;

  return [
    "dor",
    "doendo",
    "dolorido",
    "dolorida",
    "desconforto",
    "torci",
    "torceu",
    "torcao",
    "torsao",
    "lesao",
    "machuquei",
    "machucou",
    "lombar",
    "coluna",
    "joelho",
    "tornozelo",
    "pe",
    "panturrilha",
    "ombro",
    "punho",
  ].some((keyword) => text.includes(normalizeForCareCompare(keyword)));
}


function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "ALUNO") return "STUDENT";
  if (value === "PROFESSOR") return "TEACHER";

  return value;
}

function serializeWorkoutContract(contract: any) {
  if (!contract) return null;

  return {
    id: contract.id,
    type: contract.type,
    status: contract.status,
    commercialStatus: contract.commercialStatus,
    startDate: contract.startDate?.toISOString?.() || contract.startDate,
    endDate: contract.endDate?.toISOString?.() || contract.endDate,
    workoutsPerWeek: contract.workoutsPerWeek,
    workoutsPerMonth: contract.workoutsPerMonth,
    totalContractedWorkouts: contract.totalContractedWorkouts,
    planId: contract.planId || null,
    planName: contract.plan?.name || null,
  };
}

function sortWorkoutContractsByPriority<T extends { type?: string | null; endDate: Date }>(contracts: T[]): T[] {
  return contracts.sort((a, b) => {
    const aPriority = a.type === "PAID" ? 0 : 1;
    const bPriority = b.type === "PAID" ? 0 : 1;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return b.endDate.getTime() - a.endDate.getTime();
  });
}

async function findActiveWorkoutContract(studentId: string, workoutDate: Date) {
  const contracts = await prisma.studentContract.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lte: workoutDate,
      },
      endDate: {
        gte: workoutDate,
      },
    },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (contracts.length === 0) return null;

  return sortWorkoutContractsByPriority(contracts)[0];
}

async function findActiveWorkoutContractForWeek(studentId: string, week: { startOfWeek: Date; endOfWeek: Date }) {
  const contracts = await prisma.studentContract.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      startDate: {
        lt: week.endOfWeek,
      },
      endDate: {
        gte: week.startOfWeek,
      },
    },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (contracts.length === 0) return null;

  return sortWorkoutContractsByPriority(contracts)[0];
}

function normalizeWorkoutDateInsideContract(workoutDate: Date, contract: { startDate: Date; endDate: Date }): Date {
  const contractStart = new Date(contract.startDate);
  const contractEnd = new Date(contract.endDate);
  const workoutWeek = getWeekRange(workoutDate);

  if (
    workoutDate < contractStart &&
    contractStart >= workoutWeek.startOfWeek &&
    contractStart < workoutWeek.endOfWeek
  ) {
    const adjustedDate = new Date(contractStart);
    adjustedDate.setHours(12, 0, 0, 0);
    return adjustedDate;
  }

  if (
    workoutDate > contractEnd &&
    contractEnd >= workoutWeek.startOfWeek &&
    contractEnd < workoutWeek.endOfWeek
  ) {
    const adjustedDate = new Date(contractEnd);
    adjustedDate.setHours(12, 0, 0, 0);
    return adjustedDate;
  }

  return workoutDate;
}


async function normalizeExercisesFromOfficialLibrary(exercises: any[]) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error("O treino precisa ter pelo menos um exercício da biblioteca.");
  }

  const ids = exercises
    .map((ex) => String(ex?.libraryExerciseId || ex?.exerciseId || ex?.exerciseLibraryId || "").trim())
    .filter(Boolean);

  if (ids.length !== exercises.length) {
    throw new Error("Todos os exercícios do treino precisam vir da Biblioteca de Exercícios. Selecione exercícios cadastrados ou gere novamente pela IA usando exerciseId.");
  }

  const uniqueIds = Array.from(new Set(ids));

  const libraryExercises = await prisma.exerciseLibrary.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
      active: true,
    },
  });

  const libraryById = new Map(libraryExercises.map((exercise) => [exercise.id, exercise]));
  const missingIds = uniqueIds.filter((id) => !libraryById.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Um ou mais exercícios não existem ou estão inativos na biblioteca oficial: ${missingIds.join(", ")}.`);
  }

  return exercises.map((ex: any, index: number) => {
    const libraryExerciseId = String(ex?.libraryExerciseId || ex?.exerciseId || ex?.exerciseLibraryId || "").trim();
    const libraryExercise = libraryById.get(libraryExerciseId);

    if (!libraryExercise) {
      throw new Error("Exercício da biblioteca não encontrado.");
    }

    return {
      libraryExerciseId,
      name: libraryExercise.name,
      description: String(ex?.description || libraryExercise.description || ""),
      series: Number(ex?.series || 3),
      reps: ex?.reps ? String(ex.reps) : "10",
      weight: ex?.weight ? String(ex.weight) : null,
      restTime: ex?.restTime ? String(ex.restTime) : "60s",
      notes: ex?.notes ? String(ex.notes) : null,
      order: typeof ex?.order === "number" ? ex.order : index,
      videoUrl: String(ex?.videoUrl || libraryExercise.videoUrl || "") || null,
      imageUrl: String(ex?.imageUrl || libraryExercise.imageUrl || "") || null,
    };
  });
}


async function getStudentEmail(student: {
  email?: string | null;
  userAuthId?: string | null;
}): Promise<string | null> {
  if (student.email) return student.email;

  if (!student.userAuthId) return null;

  const userAuth = await prisma.user.findUnique({
    where: { id: student.userAuthId },
    select: { email: true },
  });

  return userAuth?.email || null;
}

async function getFallbackNoticeAuthorId(studentProfessorId?: string | null): Promise<string | null> {
  if (studentProfessorId) return studentProfessorId;

  const gestor = await prisma.user.findFirst({
    where: {
      role: {
        in: ["GESTOR", "ADMIN"],
      },
    },
    select: {
      id: true,
    },
  });

  return gestor?.id || null;
}

async function notifyWorkoutAvailable({
  studentId,
  planName,
  isFirstWorkoutPackage,
  authorId,
  weeklyLimit,
  startOfWeek,
  endOfWeek,
}: {
  studentId: string;
  planName: string;
  isFirstWorkoutPackage: boolean;
  authorId: string | null;
  weeklyLimit: number;
  startOfWeek: Date;
  endOfWeek: Date;
}) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      userAuthId: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!student) return;

  const studentName = student.name || "Aluno";
  const professorName = student.user?.name || "seu professor";
  const studentEmail = await getStudentEmail(student);
  const loginUrl = getAppLoginUrl();

  const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
  const weekLabel = `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`;

  const title = isFirstWorkoutPackage
    ? "Seus primeiros treinos já estão disponíveis"
    : "Seus treinos da semana estão disponíveis";

  const content = isFirstWorkoutPackage
    ? [
        `Oi, ${studentName}!`,
        "",
        `Eu sou ${professorName} e vou acompanhar seus treinos e sua evolução no Funcional UP Digital.`,
        `Seus ${weeklyLimit} treino(s) da semana de ${weekLabel} já estão disponíveis.`,
        "",
        "Como este é o seu primeiro treino, separe cerca de 10 minutos antes de começar para olhar tudo com calma: exercícios, imagens, orientações, séries, repetições e cuidados de execução.",
        "Se surgir qualquer dúvida, fale comigo pelo chat da plataforma antes de executar. Esse será nosso principal canal de comunicação sobre treino, porque mantém o acompanhamento registrado e organizado.",
        "Durante ou ao finalizar o treino, nunca deixe de registrar qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Use o registro do próprio treino ao concluir a sessão. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma. Essas informações chegam ao professor e impactam diretamente a montagem dos próximos treinos.",
        "Acompanhe também seus e-mails e os avisos da plataforma. Para dúvidas de treino, não responda pelo WhatsApp; esse canal fica reservado para contatos específicos da gestão.",
        "",
        "Conte comigo nesse processo. Vamos evoluir com segurança, consistência e respeitando o seu momento.",
        "",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n")
    : [
        `Oi, ${studentName}!`,
        "",
        `Sou ${professorName}. Seus ${weeklyLimit} treino(s) da semana de ${weekLabel} já estão disponíveis.`,
        "Antes de começar, confira as orientações, imagens, séries, repetições e cuidados de cada exercício.",
        "Se tiver dúvida ou precisar contar como foi a execução, use o chat da plataforma. Assim, consigo acompanhar seu histórico e ajustar os próximos treinos com mais segurança.",
        "Lembre-se de registrar no próprio treino qualquer incômodo, dor ou desconforto. Se precisar falar antes de concluir ou tiver dúvida sobre continuar, use o chat da plataforma. Seu relato faz parte do acompanhamento e influencia diretamente os próximos treinos.",
        "Para assuntos de treino, não responda pelo WhatsApp. A gestão pode usar esse canal em situações específicas.",
        "",
        "Bom treino!",
        professorName,
        "Funcional UP Digital",
        "Mensagem automática de acompanhamento enviada em nome do seu professor.",
      ].join("\n");

  const notificationTasks: Promise<unknown>[] = [];

  const existingWeekNotice = await prisma.notice.findFirst({
    where: {
      studentId,
      type: "WORKOUT",
      targetRole: "STUDENT",
      title,
      content: {
        contains: weekLabel,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingWeekNotice && authorId) {
    notificationTasks.push(
      prisma.notice.create({
        data: {
          title,
          content,
          type: "WORKOUT",
          targetRole: "STUDENT",
          studentId,
          authorId,
          expiresAt: endOfWeek,
        },
      })
    );
  }

  if (!existingWeekNotice && studentEmail) {
    const safeStudentName = escapeHtml(studentName);
    const safeProfessorName = escapeHtml(professorName);
    const safePlanName = escapeHtml(planName);
    const safeWeekLabel = escapeHtml(weekLabel);

    const text = `${content}\n\nAcessar meus treinos: ${loginUrl}`;

    const introHtml = isFirstWorkoutPackage
      ? `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Eu sou <strong style="color:#f5f5f5;">${safeProfessorName}</strong> e vou acompanhar seus treinos e sua evolução no Funcional UP Digital.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana de <strong style="color:#f5f5f5;">${safeWeekLabel}</strong> já estão disponíveis.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Como este é o seu primeiro treino, separe cerca de 10 minutos antes de começar para conferir exercícios, imagens, orientações, séries, repetições e cuidados de execução.
          </p>
        `
      : `
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Sou <strong style="color:#f5f5f5;">${safeProfessorName}</strong>. Seus <strong style="color:#f5f5f5;">${weeklyLimit} treino(s)</strong> da semana de <strong style="color:#f5f5f5;">${safeWeekLabel}</strong> já estão disponíveis.
          </p>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">
            Antes de começar, confira as orientações, imagens, séries, repetições e cuidados de cada exercício.
          </p>
        `;

    const html = `
      <div style="font-family: Arial, sans-serif; background:#0a0a0a; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#111111; border:1px solid #2a2a2a; border-radius:16px; padding:24px;">
          <h2 style="color:#00A19C; margin:0 0 16px;">${escapeHtml(title)}</h2>
          <p style="color:#f5f5f5; font-size:15px; line-height:1.5;">Oi, <strong>${safeStudentName}</strong>!</p>
          ${introHtml}
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Se surgir qualquer dúvida, use o chat da plataforma antes de executar. Esse é o canal principal entre você e o professor, porque mantém o acompanhamento registrado e organizado.</p>
          <div style="background:#071413; border:1px solid #005D5A; border-radius:12px; padding:14px; margin:14px 0;">
            <p style="color:#00A19C; font-size:14px; font-weight:bold; margin:0 0 8px;">Seu relato ajuda a montar o próximo treino</p>
            <p style="color:#d4d4d4; font-size:13px; line-height:1.6; margin:0;">Durante ou ao finalizar o treino, nunca deixe de registrar qualquer incômodo, dor ou desconforto, mesmo que pareça leve. Use o registro do próprio treino ao concluir a sessão. Se precisar falar antes, tiver dúvida sobre continuar ou não conseguir finalizar, use o chat da plataforma. Essas informações chegam ao professor e impactam diretamente a montagem dos próximos treinos.</p>
          </div>
          <p style="color:#d4d4d4; font-size:14px; line-height:1.6;">Para dúvidas de treino, não responda pelo WhatsApp. Esse canal fica reservado para contatos específicos da gestão.</p>
          <a href="${loginUrl}" style="display:inline-block; background:#00A19C; color:#0a0a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 18px; border-radius:10px;">Acessar meus treinos</a>
          <p style="color:#d4d4d4; font-size:13px; line-height:1.5; margin-top:22px;">${safeProfessorName}<br />Funcional UP Digital</p>
          <p style="color:#6b6b6b; font-size:11px; line-height:1.5; margin-top:4px;">Mensagem automática de acompanhamento enviada em nome do seu professor.<br />Último treino salvo neste pacote: ${safePlanName}.</p>
        </div>
      </div>
    `;

    notificationTasks.push(
      sendEmail({
        to: studentEmail,
        subject: title,
        text,
        html,
      })
    );
  }

  if (notificationTasks.length > 0) {
    await Promise.allSettled(notificationTasks);
  }
}

async function buildReleaseReviewContext({
  studentId,
  startOfWeek,
  baselineDate,
}: {
  studentId: string;
  startOfWeek: Date;
  baselineDate: Date;
}) {
  const previousWeek = getPreviousWeekRangeFromStart(startOfWeek);
  const sensitiveCareTypes = [
    "DOR_DESCONFORTO",
    "RELATO_DOR_DUVIDA",
    "PAUSA_POR_CUIDADO",
    "EXERCICIO_DIFICIL",
    "DESMOTIVACAO",
    "FALTA_TEMPO",
  ];

  const [
    previousWeekWorkouts,
    openCareEvents,
    careEventsAfterPlanning,
    openStudentQuestions,
    studentQuestionsAfterPlanning,
    student,
  ] = await Promise.all([
    prisma.workout.findMany({
      where: {
        studentId,
        date: {
          gte: previousWeek.startOfWeek,
          lt: previousWeek.endOfWeek,
        },
      },
      select: {
        id: true,
        status: true,
        date: true,
        updatedAt: true,
      },
      orderBy: {
        date: "asc",
      },
    }),

    prisma.studentCareEvent.findMany({
      where: {
        studentId,
        status: {
          not: "RESOLVIDO",
        },
        OR: [
          {
            createdAt: {
              gt: baselineDate,
            },
          },
          {
            eventType: {
              in: sensitiveCareTypes,
            },
          },
        ],
      },
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        title: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    }),

    prisma.studentCareEvent.findMany({
      where: {
        studentId,
        status: {
          not: "RESOLVIDO",
        },
        createdAt: {
          gt: baselineDate,
        },
      },
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        title: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    }),

    prisma.question.findMany({
      where: {
        studentId,
        senderRole: "STUDENT",
        resolvedAt: null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    }),

    prisma.question.findMany({
      where: {
        studentId,
        senderRole: "STUDENT",
        resolvedAt: null,
        createdAt: {
          gt: baselineDate,
        },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
    }),

    prisma.student.findUnique({
      where: {
        id: studentId,
      },
      select: {
        updatedAt: true,
      },
    }),
  ]);

  const completedPreviousWeek = previousWeekWorkouts.filter(
    (workout) => String(workout.status || "").toUpperCase() === WORKOUT_STATUS_COMPLETED
  ).length;
  const pendingPreviousWeek = previousWeekWorkouts.filter(
    (workout) => String(workout.status || "").toUpperCase() !== WORKOUT_STATUS_COMPLETED
  ).length;
  const workoutUpdatesAfterPlanning = previousWeekWorkouts.filter(
    (workout) => workout.updatedAt > baselineDate
  ).length;

  const reviewAlerts: string[] = [];
  const hasTrainingPauseCareEvent = openCareEvents.some(
    (event) => String(event.eventType || "").toUpperCase() === "PAUSA_POR_CUIDADO"
  );
  const hasCriticalOpenCareEvent = openCareEvents.some(
    (event) => String(event.severity || "").toUpperCase() === "CUIDADO"
  );
  const hasOpenPainQuestion = openStudentQuestions.some((question) =>
    hasPainOrInjuryQuestionSignal(question.content)
  );
  const painQuestionsAfterPlanning = studentQuestionsAfterPlanning.filter((question) =>
    hasPainOrInjuryQuestionSignal(question.content)
  );
  const criticalCareEventsAfterPlanning = careEventsAfterPlanning.filter(
    (event) => String(event.severity || "").toUpperCase() === "CUIDADO" || sensitiveCareTypes.includes(String(event.eventType || "").toUpperCase())
  );
  const studentProfileUpdatedAfterPlanning = Boolean(student?.updatedAt && student.updatedAt > baselineDate);
  const executionChangedAfterPlanning = workoutUpdatesAfterPlanning > 0;

  const latestContextDates = [
    ...careEventsAfterPlanning.map((event) => event.createdAt),
    ...studentQuestionsAfterPlanning.map((question) => question.createdAt),
    ...(studentProfileUpdatedAfterPlanning && student?.updatedAt ? [student.updatedAt] : []),
    ...previousWeekWorkouts
      .filter((workout) => workout.updatedAt > baselineDate)
      .map((workout) => workout.updatedAt),
  ].filter(Boolean) as Date[];

  const latestNewContextDate = latestContextDates.length > 0
    ? latestContextDates.reduce((latest, item) => (item > latest ? item : latest), latestContextDates[0])
    : null;

  const stalePrescriptionBecauseOfNewContext =
    careEventsAfterPlanning.length > 0 ||
    studentQuestionsAfterPlanning.length > 0 ||
    studentProfileUpdatedAfterPlanning ||
    executionChangedAfterPlanning;

  if (previousWeekWorkouts.length === 0) {
    reviewAlerts.push(
      "Não há treinos registrados na semana anterior ao treino que será liberado. Validar se a prescrição deve ser conservadora ou de retomada."
    );
  } else if (completedPreviousWeek === 0) {
    reviewAlerts.push(
      "A semana anterior não possui treinos concluídos. Antes de liberar, revisar se é melhor repetir, reduzir complexidade ou adaptar a proposta."
    );
  }

  if (pendingPreviousWeek > 0) {
    reviewAlerts.push(
      `A semana anterior possui ${pendingPreviousWeek} treino(s) não concluído(s). Confirmar adesão antes de evoluir carga, volume ou intensidade.`
    );
  }

  if (executionChangedAfterPlanning) {
    reviewAlerts.push(
      `Houve ${workoutUpdatesAfterPlanning} atualização(ões) em treinos anteriores depois que esta semana foi montada/pré-planejada. Recomenda-se revisar a prescrição com base na execução mais recente.`
    );
  }

  if (careEventsAfterPlanning.length > 0) {
    reviewAlerts.push(
      `Surgiu ${careEventsAfterPlanning.length} novo(s) evento(s) de cuidado depois que esta semana foi montada/pré-planejada. Para segurança, gere novo resumo IA ou ajuste manualmente o treino antes de liberar.`
    );
  }

  if (studentQuestionsAfterPlanning.length > 0) {
    reviewAlerts.push(
      `Surgiu ${studentQuestionsAfterPlanning.length} nova(s) dúvida(s)/mensagem(ns) do aluno depois que esta semana foi montada/pré-planejada. Revisar a conversa antes de liberar.`
    );
  }

  if (painQuestionsAfterPlanning.length > 0) {
    reviewAlerts.push(
      "Há nova dúvida/mensagem após o pré-planejamento com possível dor, torção, lesão ou desconforto. O treino antigo não deve ser liberado direto; gere novo resumo IA ou ajuste manualmente com foco em segurança."
    );
  }

  if (hasTrainingPauseCareEvent) {
    reviewAlerts.push(
      "Aluno em pausa por cuidado: não liberar novo treino normal enquanto o evento estiver aberto. Aguardar aptidão de retomada e revisão do professor."
    );
  }

  if (hasCriticalOpenCareEvent && !hasTrainingPauseCareEvent) {
    reviewAlerts.push(
      "Há cuidado crítico em aberto. Resolver/revisar o alerta antes de liberar a próxima semana ao aluno."
    );
  }

  if (openCareEvents.length > 0) {
    reviewAlerts.push(
      `Há ${openCareEvents.length} evento(s) de cuidado em aberto ou recente(s). Revisar dor, dificuldade, desmotivação ou falta de tempo antes de liberar.`
    );
  }

  if (openStudentQuestions.length > 0) {
    reviewAlerts.push(
      `Há ${openStudentQuestions.length} dúvida(s) aberta(s) do aluno sem resolução. Revisar/responder antes de liberar a semana.`
    );
  }

  if (hasOpenPainQuestion) {
    reviewAlerts.push(
      "Existe dúvida aberta com possível relato de dor/desconforto. Não liberar como evolução normal sem revisão do professor."
    );
  }

  if (studentProfileUpdatedAfterPlanning) {
    reviewAlerts.push(
      "O cadastro/ficha do aluno foi atualizado depois que esta semana foi montada/pré-planejada. Revisar informações atuais antes de liberar."
    );
  }

  const recommendedAction = hasTrainingPauseCareEvent
    ? "PAUSA_POR_CUIDADO_BLOQUEIA_LIBERACAO"
    : stalePrescriptionBecauseOfNewContext
      ? "GERAR_NOVO_RESUMO_IA_OU_AJUSTAR_MANUALMENTE"
      : reviewAlerts.length > 0
        ? "REVISAO_PROFESSOR_OBRIGATORIA"
        : "LIBERACAO_SEGURA";

  return {
    baselineDate: baselineDate.toISOString(),
    latestNewContextDate: latestNewContextDate ? latestNewContextDate.toISOString() : null,
    previousWeek: {
      startOfWeek: previousWeek.startOfWeek.toISOString(),
      endOfWeek: previousWeek.endOfWeek.toISOString(),
      label: `${formatDatePtBr(previousWeek.startOfWeek)} a ${formatDatePtBr(new Date(previousWeek.endOfWeek.getTime() - 1))}`,
    },
    previousWeekWorkouts: previousWeekWorkouts.length,
    completedPreviousWeek,
    pendingPreviousWeek,
    workoutUpdatesAfterPlanning,
    openCareEvents: openCareEvents.length,
    newCareEventsAfterPlanning: careEventsAfterPlanning.length,
    criticalCareEventsAfterPlanning: criticalCareEventsAfterPlanning.length,
    newStudentQuestions: openStudentQuestions.length,
    newStudentQuestionsAfterPlanning: studentQuestionsAfterPlanning.length,
    newPainQuestionsAfterPlanning: painQuestionsAfterPlanning.length,
    hasOpenPainQuestion,
    hasTrainingPauseCareEvent,
    hasCriticalOpenCareEvent,
    studentProfileUpdatedAfterPlanning,
    stalePrescriptionBecauseOfNewContext,
    recommendedAction,
    actionOptions: stalePrescriptionBecauseOfNewContext
      ? [
          "Gerar novo resumo IA com o alerta atualizado",
          "Ajustar manualmente este treino antes de liberar",
          "Manter bloqueado até obter mais informações do aluno",
        ]
      : [],
    blocksRelease: hasTrainingPauseCareEvent,
    requiresReviewBeforeRelease: reviewAlerts.length > 0,
    reviewAlerts,
  };
}

async function releaseWorkoutWeek({
  studentId,
  date,
  currentUserId,
  forceRelease,
}: {
  studentId: string;
  date?: string | null;
  currentUserId: string | null;
  forceRelease: boolean;
}) {
  if (!studentId || typeof studentId !== "string") {
    return NextResponse.json(
      { error: "studentId é obrigatório para liberar a semana." },
      { status: 400 }
    );
  }

  const referenceDate = date ? new Date(`${date}T12:00:00`) : new Date();

  if (Number.isNaN(referenceDate.getTime())) {
    return NextResponse.json(
      { error: "Data inválida para liberar a semana." },
      { status: 400 }
    );
  }

  const student = await prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      userAuthId: true,
      userAuth: {
        select: {
          birthDate: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json(
      { error: "Aluno não encontrado." },
      { status: 404 }
    );
  }

  const studentAgeYears = calculateAgeYears(student.userAuth?.birthDate);

  if (!student.userAuth?.birthDate || studentAgeYears === null) {
    return NextResponse.json(
      {
        error: "Data de nascimento não informada. Complete o cadastro do aluno antes de liberar a semana.",
        code: "BIRTH_DATE_REQUIRED",
      },
      { status: 409 }
    );
  }

  const week = getWeekRange(referenceDate);
  let activeContract = await findActiveWorkoutContract(studentId, referenceDate);

  if (!activeContract) {
    activeContract = await findActiveWorkoutContractForWeek(studentId, week);
  }

  if (!activeContract) {
    return NextResponse.json(
      { error: "Este aluno não possui contrato ativo para a semana selecionada." },
      { status: 400 }
    );
  }

  const weeklyLimit = getWeeklyWorkoutLimitFromContract(activeContract);

  if (!weeklyLimit) {
    return NextResponse.json(
      { error: "O contrato ativo não possui quantidade semanal configurada." },
      { status: 400 }
    );
  }

  if (isUnsafeCurrentWeekPlanningWindow(week.startOfWeek)) {
    return NextResponse.json(getSafeWindowBlockedPayload(), { status: 409 });
  }

  const plans = await prisma.workoutPlan.findMany({
    where: {
      studentId,
      contractId: activeContract.id,
      date: {
        gte: week.startOfWeek,
        lt: week.endOfWeek,
      },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      workouts: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  if (plans.length < weeklyLimit) {
    return NextResponse.json(
      {
        error: `A semana ainda não está completa. Existem ${plans.length}/${weeklyLimit} treino(s) planejados.`,
      },
      { status: 400 }
    );
  }

  const baselineDate = getLatestPlanUpdateDate(plans);
  const reviewContext = await buildReleaseReviewContext({
    studentId,
    startOfWeek: week.startOfWeek,
    baselineDate,
  });

  if (reviewContext.blocksRelease) {
    return NextResponse.json(
      {
        error: "Aluno em pausa por cuidado. Não é permitido liberar novo treino normal enquanto o alerta estiver aberto.",
        reviewRequired: true,
        releaseBlocked: true,
        reviewContext,
        message: "Aguarde o aluno sinalizar aptidão de retomada e resolva o alerta de cuidado antes de liberar a próxima semana.",
      },
      { status: 409 }
    );
  }

  if (reviewContext.stalePrescriptionBecauseOfNewContext && !forceRelease) {
    return NextResponse.json(
      {
        code: "NEW_CONTEXT_AFTER_PRE_PLANNING",
        error: "Este treino foi montado antes de um novo alerta do aluno.",
        message: "Para segurança, gere um novo resumo IA com o contexto atualizado ou ajuste manualmente o treino antes de liberar a semana.",
        reviewRequired: true,
        staleContextRequiresAction: true,
        reviewContext,
      },
      { status: 409 }
    );
  }

  if (reviewContext.requiresReviewBeforeRelease && !forceRelease) {
    return NextResponse.json(
      {
        error: "Revisão obrigatória antes de liberar a semana.",
        message: "Revise os pontos listados. Se o treino tiver sido ajustado ou a revisão estiver concluída, confirme a liberação.",
        reviewRequired: true,
        reviewContext,
      },
      { status: 409 }
    );
  }

  const planIds = plans.map((plan) => plan.id);

  await prisma.workout.updateMany({
    where: {
      workoutPlanId: {
        in: planIds,
      },
    },
    data: {
      status: WORKOUT_STATUS_PENDING,
    },
  });

  let emailSent = false;

  try {
    const fallbackAuthorId = await getFallbackNoticeAuthorId(student.userId);
    const authorId = currentUserId || fallbackAuthorId;
    const previousPlansCount = await prisma.workoutPlan.count({
      where: {
        studentId,
        contractId: activeContract.id,
        date: {
          lt: week.startOfWeek,
        },
      },
    });

    await notifyWorkoutAvailable({
      studentId,
      planName: plans[plans.length - 1]?.name || "Treinos da semana",
      isFirstWorkoutPackage: previousPlansCount === 0,
      authorId,
      weeklyLimit,
      startOfWeek: week.startOfWeek,
      endOfWeek: week.endOfWeek,
    });

    emailSent = true;
  } catch (notificationError) {
    console.error("Erro ao notificar aluno na liberação da semana:", notificationError);
  }

  const weekEndDisplay = new Date(week.endOfWeek.getTime() - 1);

  return NextResponse.json({
    ok: true,
    released: true,
    studentId,
    week: {
      startOfWeek: week.startOfWeek.toISOString(),
      endOfWeek: week.endOfWeek.toISOString(),
      label: `${formatDatePtBr(week.startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`,
    },
    weeklyLimit,
    releasedPlans: plans.length,
    emailSent,
    reviewContext,
    message: `Semana liberada para o aluno: ${formatDatePtBr(week.startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}.`,
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;

    const body = await req.json();
    const {
      studentId,
      name,
      description,
      date,
      notes,
      objective,
      focusAreas,
      intensity,
      estimatedDurationMinutes,
      estimatedCaloriesMin,
      estimatedCaloriesMax,
      studentSummary,
      safetyNote,
      exercises = [],
    } = body;

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json(
        { error: "studentId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    const studentExists = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        email: true,
        userId: true,
        userAuthId: true,
        contractedTrainingDaysPerMonth: true,
        userAuth: {
          select: {
            birthDate: true,
          },
        },
      },
    });

    if (!studentExists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const lowAdherencePause = await prisma.studentCareEvent.findFirst({
      where: {
        studentId,
        eventType: "PAUSA_BAIXA_ADERENCIA",
        status: { not: "RESOLVIDO" },
      },
      select: { id: true, status: true },
    });

    if (lowAdherencePause) {
      return NextResponse.json(
        {
          error: "Os treinos deste aluno estão pausados por baixa adesão. Aguarde o pedido de retomada e resolva o evento na Central de Cuidado antes de montar uma nova programação.",
          code: "LOW_ADHERENCE_PAUSE",
        },
        { status: 409 }
      );
    }

    const studentAgeYears = calculateAgeYears(studentExists.userAuth?.birthDate);

    if (!studentExists.userAuth?.birthDate || studentAgeYears === null) {
      return NextResponse.json(
        {
          error: "Data de nascimento não informada. Complete o cadastro do aluno antes de montar o treino.",
          code: "BIRTH_DATE_REQUIRED",
        },
        { status: 409 }
      );
    }

    const requestedWorkoutDate = date ? new Date(date + "T12:00:00") : new Date();
    const requestedWeek = getWeekRange(requestedWorkoutDate);

    let activeContract = await findActiveWorkoutContract(studentId, requestedWorkoutDate);

    /*
     * Aluno novo pode entrar no meio da semana.
     * Exemplo: dashboard abre a semana de segunda-feira, mas o contrato começou na quarta.
     * Nesse caso, a semana tem contrato ativo, porém a segunda-feira não tinha.
     * Usamos o contrato que cruza a semana e ajustamos a data efetiva para dentro do contrato.
     */
    if (!activeContract) {
      activeContract = await findActiveWorkoutContractForWeek(studentId, requestedWeek);
    }

    if (!activeContract) {
      return NextResponse.json(
        {
          error:
            "Este aluno não possui contrato ativo para a data do treino. Crie ou ative um contrato no Financeiro antes de montar novos treinos.",
        },
        { status: 400 }
      );
    }

    const workoutDate = normalizeWorkoutDateInsideContract(requestedWorkoutDate, activeContract);

    const existingWorkoutPlanCount = await prisma.workoutPlan.count({
      where: {
        studentId,
        contractId: activeContract.id,
      },
    });

    const isFirstWorkoutPlan = existingWorkoutPlanCount === 0;

    const weeklyLimit = getWeeklyWorkoutLimitFromContract(activeContract);

    if (!weeklyLimit) {
      return NextResponse.json(
        {
          error:
            "O contrato ativo do aluno não possui quantidade de treinos por semana configurada. Revise o contrato/plano no Financeiro.",
        },
        { status: 400 }
      );
    }

    const { startOfWeek, endOfWeek } = getWeekRange(workoutDate);

    if (isUnsafeCurrentWeekPlanningWindow(startOfWeek)) {
      return NextResponse.json(getSafeWindowBlockedPayload(), { status: 409 });
    }

    const workoutPlansThisWeek = await prisma.workoutPlan.count({
      where: {
        studentId,
        contractId: activeContract.id,
        date: {
          gte: startOfWeek,
          lt: endOfWeek,
        },
      },
    });

    if (workoutPlansThisWeek >= weeklyLimit) {
      return NextResponse.json(
        {
          error: `Este aluno já recebeu ${workoutPlansThisWeek} treino(s) na semana de ${formatDatePtBr(
            startOfWeek
          )} a ${formatDatePtBr(
            new Date(endOfWeek.getTime() - 1)
          )}. O limite atual é de ${weeklyLimit} treino(s) por semana, conforme o contrato ativo.`,
        },
        { status: 400 }
      );
    }

    let normalizedExercises;

    try {
      normalizedExercises = await normalizeExercisesFromOfficialLibrary(exercises);
    } catch (validationError: any) {
      return NextResponse.json(
        { error: validationError?.message || "Exercícios inválidos." },
        { status: 400 }
      );
    }

    const futureWeek = isFutureWeek(startOfWeek);
    const initialWorkoutStatus = futureWeek ? WORKOUT_STATUS_PRE_PLANNED : WORKOUT_STATUS_PENDING;

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          studentId,
          contractId: activeContract.id,
          name: name.trim(),
          description: description?.trim() || null,
          date: workoutDate,
          notes: notes?.trim() || null,
          objective: objective ? String(objective).trim() : null,
          focusAreas: focusAreas ? String(focusAreas).trim() : null,
          intensity: intensity ? String(intensity).trim() : null,
          estimatedDurationMinutes:
            estimatedDurationMinutes === null || estimatedDurationMinutes === undefined || estimatedDurationMinutes === ""
              ? null
              : Number(estimatedDurationMinutes),
          estimatedCaloriesMin:
            estimatedCaloriesMin === null || estimatedCaloriesMin === undefined || estimatedCaloriesMin === ""
              ? null
              : Number(estimatedCaloriesMin),
          estimatedCaloriesMax:
            estimatedCaloriesMax === null || estimatedCaloriesMax === undefined || estimatedCaloriesMax === ""
              ? null
              : Number(estimatedCaloriesMax),
          studentSummary: studentSummary ? String(studentSummary).trim() : null,
          safetyNote: safetyNote ? String(safetyNote).trim() : null,
          exercises: {
            create: normalizedExercises,
          },
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              libraryExercise: {
                select: { muscleGroup: true },
              },
            },
          },
          workouts: {
            select: {
              id: true,
              status: true,
              date: true,
              notes: true,
            },
            orderBy: { date: "asc" },
          },
        },
      });

      // CRIAR TAMBÉM UM Workout COM status "PENDENTE"
      // para que o dashboard possa contabilizar os treinos pendentes
      await tx.workout.create({
        data: {
          studentId,
          contractId: activeContract.id,
          workoutPlanId: plan.id,
          date: workoutDate,
          status: initialWorkoutStatus,
        },
      });

      return plan;
    });

    const workoutsThisWeekAfterCreate = workoutPlansThisWeek + 1;
    const isWeeklyPackageComplete = workoutsThisWeekAfterCreate >= weeklyLimit;
    let emailSent = false;

    /*
     * Regra de liberação para o aluno:
     *
     * - Professor pode montar treino de semana futura.
     * - Gestor/professor conseguem ver e controlar o planejamento.
     * - Aluno NÃO recebe e-mail/aviso quando a semana ainda é futura.
     * - Aluno só enxerga treinos da semana vigente ou semanas anteriores.
     */
    if (isWeeklyPackageComplete && !futureWeek) {
      try {
        const fallbackAuthorId = await getFallbackNoticeAuthorId(studentExists.userId);
        const authorId = currentUserId || fallbackAuthorId;

        await notifyWorkoutAvailable({
          studentId,
          planName: result.name,
          isFirstWorkoutPackage: isFirstWorkoutPlan || existingWorkoutPlanCount < weeklyLimit,
          authorId,
          weeklyLimit,
          startOfWeek,
          endOfWeek,
        });

        emailSent = true;
      } catch (notificationError) {
        console.error("Erro ao notificar aluno sobre treinos da semana:", notificationError);
      }
    }

    const weekEndDisplay = new Date(endOfWeek.getTime() - 1);

    return NextResponse.json(
      {
        ...result,
        weeklyNotification: {
          weeklyLimit,
          workoutsThisWeek: workoutsThisWeekAfterCreate,
          weekComplete: isWeeklyPackageComplete,
          futureWeek,
          emailSent,
          message: isWeeklyPackageComplete
            ? futureWeek
              ? `Semana futura pré-planejada para ${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}. Antes de ficar disponível para o aluno, faça a revisão final e libere a semana. Nenhum e-mail foi enviado agora.`
              : "Meta semanal completa. Aluno notificado sobre os treinos da semana."
            : `Treino salvo. Ainda falta(m) ${weeklyLimit - workoutsThisWeekAfterCreate} treino(s) para completar a semana.`,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;
    const role = normalizeRole(sessionUser?.role);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const studentId = searchParams.get("studentId");
    const includeSummary = searchParams.get("summary") === "1";
    const referenceDateParam = searchParams.get("date");
    const referenceDate = referenceDateParam
      ? new Date(`${referenceDateParam}T12:00:00`)
      : new Date();
    const isStudentUser = role === "STUDENT";

    if (id) {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              libraryExercise: {
                select: { muscleGroup: true },
              },
            },
          },
          workouts: {
            select: {
              id: true,
              status: true,
              date: true,
              notes: true,
            },
            orderBy: { date: "asc" },
          },
        },
      });

      if (!plan) {
        return NextResponse.json(
          { error: "Workout plan not found" },
          { status: 404 }
        );
      }

      if (isStudentUser) {
        const student = await prisma.student.findUnique({
          where: { id: plan.studentId },
          select: {
            userAuthId: true,
          },
        });

        if (!student || student.userAuthId !== currentUserId) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
        }

        const hasReleasedWorkout = plan.workouts.some((workout) =>
          isWorkoutReleasedForStudent(workout.status)
        );

        if (!hasReleasedWorkout) {
          return NextResponse.json(
            { error: "Este treino ainda não está disponível para o aluno." },
            { status: 404 }
          );
        }
      }

      return NextResponse.json(plan);
    }

    if (studentId) {
      const where: any = { studentId };

      if (isStudentUser) {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: {
            userAuthId: true,
          },
        });

        if (!student || student.userAuthId !== currentUserId) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
        }

        // Aluno só vê treinos que já passaram pela revisão/liberação final.
        // Treinos salvos como pré-planejamento ficam ocultos até o professor liberar.
        where.workouts = {
          some: {
            status: {
              notIn: [WORKOUT_STATUS_PRE_PLANNED, WORKOUT_STATUS_NEEDS_REVIEW],
            },
          },
        };
      }

      const plans = await prisma.workoutPlan.findMany({
        where,
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              libraryExercise: {
                select: { muscleGroup: true },
              },
            },
          },
          workouts: {
            select: {
              id: true,
              status: true,
              date: true,
              notes: true,
            },
            orderBy: { date: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!includeSummary) {
        return NextResponse.json(plans);
      }

      const { startOfWeek, endOfWeek } = getWeekRange(referenceDate);
      const weekEndDisplay = new Date(endOfWeek.getTime() - 1);
      let activeContract = await findActiveWorkoutContract(studentId, referenceDate);

      if (!activeContract) {
        activeContract = await findActiveWorkoutContractForWeek(studentId, {
          startOfWeek,
          endOfWeek,
        });
      }

      const effectiveWorkoutDate = activeContract
        ? normalizeWorkoutDateInsideContract(referenceDate, activeContract)
        : referenceDate;
      const weeklyLimit = getWeeklyWorkoutLimitFromContract(activeContract);

      const weeklyPlansCount = activeContract
        ? await prisma.workoutPlan.count({
            where: {
              studentId,
              contractId: activeContract.id,
              date: {
                gte: startOfWeek,
                lt: endOfWeek,
              },
            },
          })
        : 0;

      const selectedDateBeforeContractStart = Boolean(
        activeContract && referenceDate < activeContract.startDate
      );

      return NextResponse.json({
        plans,
        activeContract: serializeWorkoutContract(activeContract),
        weeklyLimit,
        weeklyPlansCount,
        weeklyRemaining:
          weeklyLimit == null ? null : Math.max(weeklyLimit - weeklyPlansCount, 0),
        week: {
          startOfWeek: startOfWeek.toISOString(),
          endOfWeek: endOfWeek.toISOString(),
          label: `${formatDatePtBr(startOfWeek)} a ${formatDatePtBr(weekEndDisplay)}`,
          futureWeek: isFutureWeek(startOfWeek),
        },
        effectiveWorkoutDate: effectiveWorkoutDate.toISOString().slice(0, 10),
        canCreateWorkout: Boolean(activeContract && weeklyLimit && weeklyPlansCount < weeklyLimit),
        message: activeContract
          ? selectedDateBeforeContractStart
            ? `Contrato ativo encontrado para esta semana. Como o contrato começa em ${formatDatePtBr(activeContract.startDate)}, o treino será salvo a partir dessa data.`
            : null
          : "Este aluno não possui contrato ativo para a data selecionada.",
      });
    }

    return NextResponse.json(
      { error: "Provide either id or studentId query parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("GET /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "").toUpperCase();

    if (action === "RELEASE_WEEK") {
      const session = await getServerSession(authOptions);
      const sessionUser = session?.user as any;
      const currentUserId = sessionUser?.id ? String(sessionUser.id) : null;

      return releaseWorkoutWeek({
        studentId: String(body?.studentId || ""),
        date: body?.date ? String(body.date) : null,
        currentUserId,
        forceRelease: Boolean(body?.forceRelease),
      });
    }

    const {
      id,
      name,
      description,
      date,
      notes,
      objective,
      focusAreas,
      intensity,
      estimatedDurationMinutes,
      estimatedCaloriesMin,
      estimatedCaloriesMax,
      studentSummary,
      safetyNote,
      exercises,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        contractId: true,
      },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    const studentAgeContext = await prisma.student.findUnique({
      where: { id: planExists.studentId },
      select: {
        userAuth: {
          select: {
            birthDate: true,
          },
        },
      },
    });
    const studentAgeYears = calculateAgeYears(studentAgeContext?.userAuth?.birthDate);

    if (!studentAgeContext?.userAuth?.birthDate || studentAgeYears === null) {
      return NextResponse.json(
        {
          error: "Data de nascimento não informada. Complete o cadastro do aluno antes de editar o treino.",
          code: "BIRTH_DATE_REQUIRED",
        },
        { status: 409 }
      );
    }

    if (exercises !== undefined && !Array.isArray(exercises)) {
      return NextResponse.json(
        { error: "exercises must be an array" },
        { status: 400 }
      );
    }

    if (exercises !== undefined && exercises.length === 0) {
      return NextResponse.json(
        { error: "O treino precisa ter pelo menos um exercício." },
        { status: 400 }
      );
    }

    const data: any = {};

    if (name !== undefined) data.name = String(name || "").trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;
    if (date !== undefined) data.date = date ? new Date(date + "T12:00:00") : null;

    let nextContractId: string | null = null;

    if (data.date) {
      const requestedDate = data.date;
      const requestedWeek = getWeekRange(requestedDate);
      let activeContract = await findActiveWorkoutContract(planExists.studentId, requestedDate);

      if (!activeContract) {
        activeContract = await findActiveWorkoutContractForWeek(planExists.studentId, requestedWeek);
      }

      if (!activeContract) {
        return NextResponse.json(
          {
            error:
              "Este aluno não possui contrato ativo para a nova data do treino. Ajuste a data ou regularize o contrato no Financeiro.",
          },
          { status: 400 }
        );
      }

      data.date = normalizeWorkoutDateInsideContract(requestedDate, activeContract);

      if (isUnsafeCurrentWeekPlanningWindow(getWeekRange(data.date).startOfWeek)) {
        return NextResponse.json(getSafeWindowBlockedPayload(), { status: 409 });
      }

      data.contractId = activeContract.id;
      nextContractId = activeContract.id;
    }
    if (objective !== undefined) data.objective = objective ? String(objective).trim() : null;
    if (focusAreas !== undefined) data.focusAreas = focusAreas ? String(focusAreas).trim() : null;
    if (intensity !== undefined) data.intensity = intensity ? String(intensity).trim() : null;
    if (estimatedDurationMinutes !== undefined) {
      data.estimatedDurationMinutes =
        estimatedDurationMinutes === null || estimatedDurationMinutes === ""
          ? null
          : Number(estimatedDurationMinutes);
    }
    if (estimatedCaloriesMin !== undefined) {
      data.estimatedCaloriesMin =
        estimatedCaloriesMin === null || estimatedCaloriesMin === ""
          ? null
          : Number(estimatedCaloriesMin);
    }
    if (estimatedCaloriesMax !== undefined) {
      data.estimatedCaloriesMax =
        estimatedCaloriesMax === null || estimatedCaloriesMax === ""
          ? null
          : Number(estimatedCaloriesMax);
    }
    if (studentSummary !== undefined) data.studentSummary = studentSummary ? String(studentSummary).trim() : null;
    if (safetyNote !== undefined) data.safetyNote = safetyNote ? String(safetyNote).trim() : null;

    let normalizedExercises = null;

    if (Array.isArray(exercises)) {
      try {
        normalizedExercises = await normalizeExercisesFromOfficialLibrary(exercises);
      } catch (validationError: any) {
        return NextResponse.json(
          { error: validationError?.message || "Exercícios inválidos." },
          { status: 400 }
        );
      }
    }

    const plan = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.workoutPlan.update({
          where: { id },
          data,
        });
      }

      if (data.date !== undefined) {
        await tx.workout.updateMany({
          where: { workoutPlanId: id },
          data: {
            date: data.date,
            ...(nextContractId ? { contractId: nextContractId } : {}),
          },
        });
      }

      if (normalizedExercises) {
        await tx.exercise.deleteMany({
          where: { workoutPlanId: id },
        });

        await tx.exercise.createMany({
          data: normalizedExercises.map((exercise: any) => ({
            ...exercise,
            workoutPlanId: id,
          })),
        });
      }

      return tx.workoutPlan.findUnique({
        where: { id },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              libraryExercise: {
                select: { muscleGroup: true },
              },
            },
          },
        },
      });
    });

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("PUT /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const planExists = await prisma.workoutPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!planExists) {
      return NextResponse.json(
        { error: "Workout plan not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.exercise.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workout.deleteMany({
        where: { workoutPlanId: id },
      });
      await tx.workoutPlan.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error("DELETE /api/workout-plan error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message },
      { status: 500 }
    );
  }
}
