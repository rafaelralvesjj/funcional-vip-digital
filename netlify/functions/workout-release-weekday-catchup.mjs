import { invokeWorkoutRelease } from "../lib/workout-release-helper.mjs";

// UTC: preserves the original Vercel schedule in vercel.json.
export default async () => {
  await invokeWorkoutRelease("/api/cron/release-workouts-catchup");
};

export const config = { schedule: "15 10 * * 1-5" };
