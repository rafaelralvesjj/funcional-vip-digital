import { NextRequest, NextResponse } from "next/server";
import { expireOverduePendingWorkouts } from "@/lib/workout-status-lifecycle";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireOverduePendingWorkouts();

    return NextResponse.json({
      ok: true,
      workoutsUpdated: result.count,
      newStatus: result.status,
      expirationBoundary: result.expirationBoundary.toISOString(),
    });
  } catch (error: any) {
    console.error("GET /api/cron/expire-workouts error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Não foi possível encerrar os treinos vencidos.",
        message: error?.message || "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
