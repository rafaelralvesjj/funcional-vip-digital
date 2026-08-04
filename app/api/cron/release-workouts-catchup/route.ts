import { NextRequest } from "next/server";
import { GET as releaseCurrentWorkoutWeek } from "../release-workouts/route";
import { releaseCurrentWeekPreplannedWorkouts } from "@/lib/workout-status-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Só executa a correção automática quando a chamada é realmente do cron.
  // A validação definitiva continua sendo feita pela rota principal abaixo.
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // A recuperação diária não depende da quantidade de treinos cadastrados:
    // todo PRE_PLANEJADO da semana atual deve virar PENDENTE.
    await releaseCurrentWeekPreplannedWorkouts();
  }

  return releaseCurrentWorkoutWeek(request);
}
