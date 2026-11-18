import { invokeWorkoutRelease } from "./_workout-release-helper.mjs";

// UTC: preserves the original Vercel schedule in vercel.json.
export default async () => {
  await invokeWorkoutRelease("/api/cron/release-workouts");
};

export const config = { schedule: "0 0-2 * * 1" };
