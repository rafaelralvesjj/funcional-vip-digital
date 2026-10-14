/**
 * Backfill explícito e conservador de Workout.completedAt para treinos
 * concluídos ANTES desta feature existir (coluna nova, sempre null até
 * agora). Nunca inventa precisão: Workout.date é a data PLANEJADA, não a de
 * conclusão, então não é usada aqui como substituto (ver REVISÃO item 2 do
 * PR #13 / lib/workout-method-mode.ts).
 *
 * Estratégia: para cada aluno, o único instante de conclusão recuperável
 * com confiança no histórico é o evento WorkoutEngagementNotification
 * (eventType "FIRST_WORKOUT_COMPLETED", eventKey "FIRST") — gravado pela
 * própria rota de conclusão (app/api/workout/mark-complete/route.ts) na
 * MESMA requisição em que o primeiro treino do aluno foi marcado como
 * concluído, com `sentAt` default now(). Isso cobre exatamente a data que
 * a elegibilidade de 30 dias do convite ao combinado precisa (o PRIMEIRO
 * treino concluído).
 *
 * Quando esse evento existe e aponta para um Workout sem completedAt, o
 * script preenche com `sentAt`. Quando não existe evidência confiável (sem
 * evento, ou workoutId do evento não bate com nenhum Workout do aluno), o
 * aluno é listado ao final para revisão manual — nenhum completedAt é
 * inventado a partir de `date`.
 *
 * Idempotente (só atualiza Workout com completedAt ainda null) e aditivo —
 * não apaga nem sobrescreve nenhum dado. Nunca roda sozinho:
 *
 *   DATABASE_URL="<preview>" npx tsx scripts/backfill-workout-completed-at.ts
 *   DATABASE_URL="<producao>" npx tsx scripts/backfill-workout-completed-at.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPLETED_WORKOUT_STATUSES = ["CONCLUIDO", "CONCLUIDO_PARCIALMENTE"];

function describeDatabaseTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "(DATABASE_URL não definida)";

  try {
    return new URL(url).host;
  } catch {
    return "(DATABASE_URL em formato inesperado)";
  }
}

async function main() {
  console.log(`Alvo: ${describeDatabaseTarget()}`);

  const studentsWithUnresolvedCompletion = await prisma.student.findMany({
    where: {
      workouts: {
        some: {
          status: { in: COMPLETED_WORKOUT_STATUSES },
          completedAt: null,
        },
      },
    },
    select: { id: true, name: true },
  });

  console.log(
    `${studentsWithUnresolvedCompletion.length} aluno(s) com treino concluído sem completedAt.`
  );

  let backfilled = 0;
  const unresolved: Array<{ studentId: string; name: string; reason: string }> = [];

  for (const student of studentsWithUnresolvedCompletion) {
    const firstCompletionEvent = await prisma.workoutEngagementNotification.findFirst({
      where: {
        studentId: student.id,
        eventType: "FIRST_WORKOUT_COMPLETED",
        eventKey: "FIRST",
      },
      select: { workoutId: true, sentAt: true },
    });

    if (!firstCompletionEvent?.workoutId) {
      unresolved.push({
        studentId: student.id,
        name: student.name,
        reason: "Nenhum evento FIRST_WORKOUT_COMPLETED encontrado.",
      });
      continue;
    }

    const targetWorkout = await prisma.workout.findUnique({
      where: { id: firstCompletionEvent.workoutId },
      select: { id: true, studentId: true, completedAt: true, status: true },
    });

    if (!targetWorkout || targetWorkout.studentId !== student.id) {
      unresolved.push({
        studentId: student.id,
        name: student.name,
        reason: "Evento FIRST_WORKOUT_COMPLETED aponta para um Workout inexistente ou de outro aluno.",
      });
      continue;
    }

    if (targetWorkout.completedAt) {
      // Já resolvido (idempotência) — nada a fazer.
      continue;
    }

    if (!COMPLETED_WORKOUT_STATUSES.includes(targetWorkout.status)) {
      unresolved.push({
        studentId: student.id,
        name: student.name,
        reason: `Workout do evento FIRST_WORKOUT_COMPLETED está em status "${targetWorkout.status}" (não concluído) — não preenchido.`,
      });
      continue;
    }

    await prisma.workout.update({
      where: { id: targetWorkout.id },
      data: { completedAt: firstCompletionEvent.sentAt },
    });

    backfilled += 1;
    console.log(
      `[preenchido] ${student.name} (${student.id}): completedAt = ${firstCompletionEvent.sentAt.toISOString()} (workout ${targetWorkout.id}).`
    );
  }

  console.log(`\n${backfilled} Workout(s) preenchido(s) a partir do evento FIRST_WORKOUT_COMPLETED.`);

  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} aluno(s) SEM evidência confiável — completedAt permanece null, revisar manualmente:`
    );
    for (const entry of unresolved) {
      console.log(`  - ${entry.name} (${entry.studentId}): ${entry.reason}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("Erro ao recuperar completedAt histórico:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
