// Shared Netlify schedule runner. Existing Next.js routes own business logic and idempotency.
// Never invoke real student-facing automations from deploy previews.
export async function invokeScheduledRoute(path) {
  if (process.env.CONTEXT !== "production") {
    console.log("Scheduled task skipped outside production", { path });
    return;
  }
  const baseUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) throw new Error("Missing Netlify URL or CRON_SECRET");

  const response = await fetch(new URL(path, baseUrl), {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Scheduled task ${path} failed HTTP ${response.status}`);
  const result = await response.json();
  if (result.ok === false || Number(result.totals?.errors || 0) > 0 ||
      Number(result.errors?.length || 0) > 0 ||
      Number(result.initial?.failed || 0) > 0 ||
      Number(result.reminders?.failed || 0) > 0) {
    throw new Error(`Scheduled task ${path} reported processing errors`);
  }
  console.log("Scheduled task completed", { path, ok: true });
}
