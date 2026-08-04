import { prisma } from "@/lib/prisma";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const MISSED_WORKOUT_STATUS = "NAO_REALIZADO";

type ExpireOverduePendingWorkoutsOptions = {
  studentId?: string | null;
  teacherUserId?: string | null;
  referenceDate?: Date;
};

type ReleaseCurrentWeekPreplannedWorkoutsOptions = {
  studentId?: string | null;
  teacherUserId?: string | null;
  referenceDate?: Date;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

function getLocalDateParts(date: Date, timeZone = BUSINESS_TIME_ZONE): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone = BUSINESS_TIME_ZONE): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.get("hour")) % 24;

  const representedAsUtc = Date.UTC(
    Number(values.get("year")),
    Number(values.get("month")) - 1,
    Number(values.get("day")),
    hour,
    Number(values.get("minute")),
    Number(values.get("second"))
  );

  return representedAsUtc - date.getTime();
}

function localMidnightToUtc(parts: LocalDateParts, timeZone = BUSINESS_TIME_ZONE): Date {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  let offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);

  const adjustedOffset = getTimeZoneOffsetMilliseconds(result, timeZone);
  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    result = new Date(utcGuess - offset);
  }

  return result;
}

function shiftLocalDate(parts: LocalDateParts, days: number): LocalDateParts {
  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() + days);

  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}


export function getCurrentWorkoutWeekRange(referenceDate = new Date()): {
  startOfWeek: Date;
  endOfWeek: Date;
} {
  const today = getLocalDateParts(referenceDate);
  const localCursor = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0, 0));
  const weekday = localCursor.getUTCDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;

  const startParts = shiftLocalDate(today, diffToMonday);
  const endParts = shiftLocalDate(startParts, 7);

  return {
    startOfWeek: localMidnightToUtc(startParts),
    endOfWeek: localMidnightToUtc(endParts),
  };
}

/**
 * Libera automaticamente os treinos da semana atual que ainda estejam como
 * PRE_PLANEJADO. Treinos de semanas futuras permanecem ocultos para o aluno.
 *
 * A rotina é idempotente e não altera treinos concluídos, interrompidos ou
 * marcados para revisão. Alunos com pausa ativa por baixa adesão continuam
 * bloqueados até a retomada pelo professor.
 */
export async function releaseCurrentWeekPreplannedWorkouts(
  options: ReleaseCurrentWeekPreplannedWorkoutsOptions = {}
): Promise<{ count: number; startOfWeek: Date; endOfWeek: Date; status: string }> {
  const { startOfWeek, endOfWeek } = getCurrentWorkoutWeekRange(
    options.referenceDate || new Date()
  );

  const studentWhere: any = { active: true };

  if (options.studentId) {
    studentWhere.id = String(options.studentId);
  } else if (options.teacherUserId) {
    const teacherUserId = String(options.teacherUserId);
    studentWhere.OR = [
      { userId: teacherUserId },
      {
        contracts: {
          some: {
            professorId: teacherUserId,
            status: "ACTIVE",
            startDate: { lt: endOfWeek },
            endDate: { gte: startOfWeek },
          },
        },
      },
    ];
  }

  const eligibleStudents = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true },
  });
  const eligibleStudentIds = eligibleStudents.map((student) => student.id);

  if (eligibleStudentIds.length === 0) {
    return { count: 0, startOfWeek, endOfWeek, status: "PENDENTE" };
  }

  const pausedStudents = await prisma.studentCareEvent.findMany({
    where: {
      studentId: { in: eligibleStudentIds },
      eventType: { in: ["PAUSA_BAIXA_ADERENCIA", "PAUSA_POR_CUIDADO"] },
      status: { not: "RESOLVIDO" },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  const pausedStudentIds = new Set(pausedStudents.map((event) => event.studentId));
  const releasableStudentIds = eligibleStudentIds.filter(
    (studentId) => !pausedStudentIds.has(studentId)
  );

  if (releasableStudentIds.length === 0) {
    return { count: 0, startOfWeek, endOfWeek, status: "PENDENTE" };
  }

  const candidates = await prisma.workout.findMany({
    where: {
      studentId: { in: releasableStudentIds },
      status: "PRE_PLANEJADO",
      date: { gte: startOfWeek, lt: endOfWeek },
    },
    select: {
      id: true,
      workoutPlan: {
        select: { active: true },
      },
    },
  });

  const workoutIds = candidates
    .filter((workout) => workout.workoutPlan?.active)
    .map((workout) => workout.id);

  if (workoutIds.length === 0) {
    return { count: 0, startOfWeek, endOfWeek, status: "PENDENTE" };
  }

  const result = await prisma.workout.updateMany({
    where: {
      id: { in: workoutIds },
      status: "PRE_PLANEJADO",
    },
    data: { status: "PENDENTE" },
  });

  return {
    count: result.count,
    startOfWeek,
    endOfWeek,
    status: "PENDENTE",
  };
}

/**
 * Retorna o limite exclusivo dos treinos que já perderam a janela de conclusão.
 *
 * Regra do produto:
 * - de segunda a sexta, somente semanas anteriores são encerradas;
 * - a partir de sábado, 00h00 em Brasília, a semana que terminou na sexta
 *   também passa a ser considerada encerrada.
 */
export function getWorkoutExpirationBoundary(referenceDate = new Date()): Date {
  const today = getLocalDateParts(referenceDate);
  const localCursor = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0, 0));
  const weekday = localCursor.getUTCDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;

  const currentWeekStartParts = shiftLocalDate(today, diffToMonday);
  const validationClosureParts = shiftLocalDate(currentWeekStartParts, 5);
  const nextWeekStartParts = shiftLocalDate(currentWeekStartParts, 7);

  const currentWeekStart = localMidnightToUtc(currentWeekStartParts);
  const validationClosure = localMidnightToUtc(validationClosureParts);
  const nextWeekStart = localMidnightToUtc(nextWeekStartParts);

  return referenceDate >= validationClosure ? nextWeekStart : currentWeekStart;
}

export async function expireOverduePendingWorkouts(
  options: ExpireOverduePendingWorkoutsOptions = {}
): Promise<{ count: number; expirationBoundary: Date; status: string }> {
  const expirationBoundary = getWorkoutExpirationBoundary(options.referenceDate || new Date());

  let studentIds: string[] | undefined;

  if (options.studentId) {
    studentIds = [String(options.studentId)];
  } else if (options.teacherUserId) {
    const students = await prisma.student.findMany({
      where: {
        active: true,
        userId: String(options.teacherUserId),
      },
      select: { id: true },
    });

    studentIds = students.map((student) => student.id);

    if (studentIds.length === 0) {
      return {
        count: 0,
        expirationBoundary,
        status: MISSED_WORKOUT_STATUS,
      };
    }
  }

  const result = await prisma.workout.updateMany({
    where: {
      status: "PENDENTE",
      date: { lt: expirationBoundary },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    data: {
      status: MISSED_WORKOUT_STATUS,
    },
  });

  return {
    count: result.count,
    expirationBoundary,
    status: MISSED_WORKOUT_STATUS,
  };
}
