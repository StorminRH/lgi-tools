import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import { isNoteworthySweep } from './noteworthy';

/**
 * Declares the 15-minute sync watchdog as an idle-silent, lock-free route.
 * Healthy no-ops emit only the shell's boundary line; failures and re-armed
 * subjects are noteworthy and therefore write durable telemetry.
 */
export const syncSweeperDeclaration: CronRouteDeclaration<CronSyncSweeperResponse> = {
  name: 'cron:sync-sweeper',
  action: 'cron_sync_sweeper',
  wakeClass: 'idle-silent',
  record: { policy: 'noteworthy' },
  lock: {
    mode: 'none',
    justification: 'the watchdog calls Convex only and healthy no-ops must not touch Neon',
  },
  work: async () => {
    const summary = await runSweep(Date.now());

    if ((summary.dispatched ?? 0) > 0) {
      console.error(
        `[cron:sync-sweeper] re-armed ${summary.dispatched} overdue subject(s) — the deployment's 30s scan is dead or lagging`,
      );
    }

    return {
      outcome: summary.status,
      workDone: isNoteworthySweep(summary),
      telemetry: { ...summary },
      body: summary,
    };
  },
};

async function runSweep(started: number): Promise<CronSyncSweeperResponse> {
  const base = {
    dispatched: null,
    retired: null,
    deleted: null,
  };
  // Literal read is build-inlined by Next; on Vercel it exists only in the
  // build environment, never as a runtime server variable.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl === undefined || convexUrl === '') {
    return {
      status: 'skipped',
      reason: 'convex_not_configured',
      ...base,
      durationMs: 0,
    };
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
    const response = await fetchWithTimeout(`${siteUrl}/sweep`, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceSecret}` },
    });
    if (!response.ok) {
      return {
        status: 'failed',
        reason: `sweep_http_${response.status}`,
        ...base,
        durationMs: Date.now() - started,
      };
    }
    // First-party service response; the engine's sweep mutation owns the
    // trusted count shape.
    const counts = (await response.json()) as {
      dispatched: number;
      retired: number;
      deleted: number;
    };
    return {
      status: 'swept',
      ...counts,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      status: 'failed',
      reason: err instanceof Error ? err.name : 'fetch_failed',
      ...base,
      durationMs: Date.now() - started,
    };
  }
}
