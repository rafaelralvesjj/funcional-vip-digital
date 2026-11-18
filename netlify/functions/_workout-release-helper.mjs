// Netlify scheduled-function adapter. Keep workout business rules in the existing Next.js route.
// Never log CRON_SECRET or student-level responses.
export async function invokeWorkoutRelease(path) {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) throw new Error("Netlify URL or CRON_SECRET is missing");

  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Workout release request failed: HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok || Number(result.totals?.errors || 0) > 0) {
    throw new Error(`Workout release completed with ${result.totals?.errors ?? "unknown"} errors`);
  }
  console.log("Workout release completed", {
    checked: result.totals?.studentsChecked,
    released: result.totals?.released,
    skipped: result.totals?.skipped,
  });
}
