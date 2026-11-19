import { invokeScheduledRoute } from "../lib/scheduled-task-helper.mjs";

// Schedule in UTC, preserving original vercel.json timing.
export default async () => invokeScheduledRoute("/api/cron/expire-workouts");
export const config = { schedule: "10 3 * * *" };
