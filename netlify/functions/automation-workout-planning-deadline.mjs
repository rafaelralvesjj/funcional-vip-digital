import { invokeScheduledRoute } from "../lib/scheduled-task-helper.mjs";

// Schedule in UTC, preserving original vercel.json timing.
export default async () => invokeScheduledRoute("/api/cron/workout-planning-deadline");
export const config = { schedule: "0 12 * * 6" };
