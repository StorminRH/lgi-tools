import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import { logUsageEvent } from '@/data/telemetry/queries';
import { requireCronAuth, swallow } from '@/lib/cron';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import { isNoteworthySweep } from './noteworthy';

// Vercel-cron endpoint, scheduled in vercel.json ("*/15 * * * *"). Vercel's
// cron invoker sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject
// anything else with 401 so the URL stays inert if scraped.
//
// The presence-gated sync engine's external watchdog (3.4.9): the engine's
// own 30s Convex cron is the dispatcher; this route runs the same
// reconciliation once from a different failure domain, so dropped timers and
// post-deploy gaps heal within 15 minutes even if the Convex scheduler is
// the thing that broke. A healthy sweep is observably a no-op (all counts
// zero); `dispatched > 0` is the alarm and is logged loudly. Talks to the
// deployment's HTTP-actions origin (.convex.site — API port + 1 locally)
// with the service secret both sides already hold; per-character sync still
// never rides Vercel crons — this is one coarse global reconciler.
// No user input — bearer-auth only, body and query params ignored.
// authz: cron
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const started = Date.now();
  const summary = await runSweep(started);

  // Structured boundary line on EVERY run (runtime logs) — the always-on "it
  // fired" signal. A non-zero dispatched count also gets its own loud line so
  // `vercel logs` surfaces a lagging Convex scan.
  console.log(JSON.stringify({ scope: 'cron:sync-sweeper', ...summary }));
  if ((summary.dispatched ?? 0) > 0) {
    console.error(
      `[cron:sync-sweeper] re-armed ${summary.dispatched} overdue subject(s) — the deployment's 30s scan is dead or lagging`,
    );
  }
  // Durable telemetry row (the cron_prices/cron_gsc pattern) ONLY when the run
  // is noteworthy — a re-arm or a failure. A healthy 15-min no-op used to write
  // here unconditionally, and on an idle system that INSERT was the sole thing
  // waking Neon's compute (~$6/mo of kept-warm at zero users). Gating it lets
  // Neon scale-to-zero between the daily crons; the console.log above keeps the
  // "did it run" signal in the runtime logs.
  if (isNoteworthySweep(summary)) {
    await swallow(
      '[cron:sync-sweeper] telemetry write failed',
      logUsageEvent({ action: 'cron_sync_sweeper', metadata: { ...summary } }),
    );
  }

  return Response.json(summary satisfies CronSyncSweeperResponse);
}

async function runSweep(started: number): Promise<CronSyncSweeperResponse> {
  const base = {
    dispatched: null,
    retired: null,
    deleted: null,
  };
  // Literal read — build-inlined by Next (the src/proxy.ts precedent): on
  // Vercel this var exists only in the build env, never at function runtime.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl === undefined || convexUrl === '') {
    // Convex-less build (the site runs without it) — nothing to sweep.
    return { status: 'skipped', reason: 'convex_not_configured', ...base, durationMs: 0 };
  }
  const siteUrl = deriveConvexSiteUrl(convexUrl);
  if (siteUrl === null) {
    return {
      status: 'failed',
      reason: 'unrecognized_convex_url',
      ...base,
      durationMs: Date.now() - started,
    };
  }
  const serviceSecret = readEnv('CONVEX_SERVICE_SECRET');
  if (!serviceSecret) {
    return {
      status: 'failed',
      reason: 'service_secret_missing',
      ...base,
      durationMs: Date.now() - started,
    };
  }
  try {
    const res = await fetchWithTimeout(`${siteUrl}/sweep`, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceSecret}` },
    });
    if (!res.ok) {
      return {
        status: 'failed',
        reason: `sweep_http_${res.status}`,
        ...base,
        durationMs: Date.now() - started,
      };
    }
    // Internal service response — shape-trusted like the other first-party
    // service calls (the engine's sweep mutation returns these counts).
    const counts = (await res.json()) as { dispatched: number; retired: number; deleted: number };
    return { status: 'swept', ...counts, durationMs: Date.now() - started };
  } catch (err) {
    return {
      status: 'failed',
      reason: err instanceof Error ? err.name : 'fetch_failed',
      ...base,
      durationMs: Date.now() - started,
    };
  }
}
