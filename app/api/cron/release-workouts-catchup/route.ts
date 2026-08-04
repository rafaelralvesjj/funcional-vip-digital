import { NextRequest } from "next/server";
import { GET as releaseCurrentWorkoutWeek } from "../release-workouts/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return releaseCurrentWorkoutWeek(request);
}
