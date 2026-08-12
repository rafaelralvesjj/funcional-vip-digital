import { prisma } from "@/lib/prisma";
import {
  civilKeyToUtcDate,
  getCurrentWorkoutWeekCivilRange,
  getWorkoutExpirationBoundaryCivilKey,
} from "@/lib/workout-validation-window";

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

export function getCurrentWorkoutWeekRange(referenceDate = new Date()): {
  startOfWeek: Date;
  endOfWeek: Date;
} {
  const { startKey, nextWeekStartKey } = getCurrentWorkoutWeekCivilRange(referenceDate);

  /*
   * Workout.date e WorkoutPlan.date são datas civis de calendário. Para filtrar
   * no banco, usamos 00:00 UTC da própria data civil. Converter "segunda 00:00"
   * de Brasília para 03:00 UTC excluía treinos antigos salvos como 00:00 UTC.
   */
  return {
    startOfWeek: civilKeyToUtcDate(startKey),
    endOfWeek: civilKeyToUtcDate(nextWeekStartKey),
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
 * - treinos de segunda a sexta encerram na sexta, como já acontecia;
 * - treino programado para sábado continua aberto no sábado;
 * - treino programado para domingo continua aberto no domingo.
 */
export function getWorkoutExpirationBoundary(referenceDate = new Date()): Date {
  return civilKeyToUtcDate(getWorkoutExpirationBoundaryCivilKey(referenceDate));
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

  /*
   * Repara automaticamente treinos que tenham sido encerrados cedo por uma
   * versão anterior da regra. NAO_REALIZADO é um status automático; se a data
   * está dentro ou depois da fronteira ainda válida, ele volta a PENDENTE.
   * Restrição a plano ativo evita reabrir versões históricas substituídas.
   */
  await prisma.workout.updateMany({
    where: {
      status: MISSED_WORKOUT_STATUS,
      date: { gte: expirationBoundary },
      workoutPlan: { active: true },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    data: {
      status: "PENDENTE",
    },
  });

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
