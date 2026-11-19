import { invokeScheduledRoute } from "../lib/scheduled-task-helper.mjs";

// Schedule in UTC, preserving original vercel.json timing.
export default async () => invokeScheduledRoute("/api/cron/saturday-communication");
export const config = { schedule: "30 12 * * 6" };
