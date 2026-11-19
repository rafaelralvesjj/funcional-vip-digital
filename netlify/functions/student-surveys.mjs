import { invokeWorkoutRelease } from "../lib/workout-release-helper.mjs";

// Preserve the exact UTC schedule from vercel.json; keep business rules in Next.js.
export default async () => {
  await invokeWorkoutRelease("/api/cron/student-surveys");
};

export const config = { schedule: "0 13 * * *" };
