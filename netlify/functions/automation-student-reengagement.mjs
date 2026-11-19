import { invokeScheduledRoute } from "../lib/scheduled-task-helper.mjs";

// Schedule in UTC, preserving original vercel.json timing.
export default async () => invokeScheduledRoute("/api/cron/student-reengagement");
export const config = { schedule: "0 11 * * *" };
