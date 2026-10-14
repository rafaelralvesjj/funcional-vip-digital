/**
 * Migração pontual e auditável do modo de treino estruturado (NORMAL /
 * COMBINADO) para alunos específicos, sem nenhuma heurística/inferência por
 * texto (ver lib/workout-method-mode.ts). Só define explicitamente:
 *
 *   - Denize (aecf26ec-fbf5-4e36-acc2-701bb6bae4e9) -> COMBINADO
 *   - Rafael (a27b6cc6-0fb3-472a-96ff-032544622075) -> NORMAL
 *
 * Todo o resto da base já nasce/permanece em NORMAL via o default da coluna
 * (Student.workoutMethodMode default "NORMAL") — não precisa de nenhum
 * UPDATE em massa aqui. Idempotente: pedir o modo que já está ativo é
 * no-op (ver resolveWorkoutMethodModeChange), então pode ser executado mais
 * de uma vez com segurança. Nunca toca em WorkoutPlan/Workout/Exercise.
 * Nunca roda sozinho — primeiro no Preview, só depois (com aprovação
 * explícita) em produção:
 *
 *   DATABASE_URL="<preview>" npx tsx scripts/set-initial-workout-method-mode.ts
 *   DATABASE_URL="<producao>" npx tsx scripts/set-initial-workout-method-mode.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeWorkoutMethodMode, resolveWorkoutMethodModeChange } from "../lib/workout-method-mode";

const prisma = new PrismaClient();

const ASSIGNMENTS: Array<{ studentId: string; label: string; mode: "NORMAL" | "COMBINADO" }> = [
  { studentId: "aecf26ec-fbf5-4e36-acc2-701bb6bae4e9", label: "Denize", mode: "COMBINADO" },
  { studentId: "a27b6cc6-0fb3-472a-96ff-032544622075", label: "Rafael", mode: "NORMAL" },
];

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

  for (const assignment of ASSIGNMENTS) {
    const student = await prisma.student.findUnique({
      where: { id: assignment.studentId },
      select: { id: true, name: true, workoutMethodMode: true },
    });

    if (!student) {
      console.warn(
        `[pulado] ${assignment.label} (${assignment.studentId}) não encontrado neste banco.`
      );
      continue;
    }

    const currentMode = normalizeWorkoutMethodMode(student.workoutMethodMode);

    const change = resolveWorkoutMethodModeChange({
      currentMode,
      requestedMode: assignment.mode,
      // Migração administrativa explícita: a elegibilidade de 30 dias é
      // regra só para o convite self-service ao COMBINADO, não para esta
      // atribuição pontual e deliberada.
      isEligibleForCombined: true,
    });

    if (!change) {
      console.log(
        `[sem mudança] ${assignment.label} (${student.id}) já está em ${currentMode}.`
      );
      continue;
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.student.update({
        where: { id: student.id },
        data: {
          workoutMethodMode: change.newMode,
          workoutMethodModeChangedAt: now,
        },
      }),
      prisma.studentWorkoutMethodChange.create({
        data: {
          studentId: student.id,
          previousMode: change.previousMode,
          newMode: change.newMode,
          source: "MIGRATION_SCRIPT",
          changedAt: now,
        },
      }),
    ]);

    console.log(
      `[atualizado] ${assignment.label} (${student.id}): ${change.previousMode} -> ${change.newMode}.`
    );
  }

  console.log("\nMigração de modo de treino concluída.");
}

main()
  .catch((error) => {
    console.error("Erro ao migrar modo de treino inicial:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
