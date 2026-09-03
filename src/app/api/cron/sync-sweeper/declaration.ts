import { z } from 'zod';
import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import { isNoteworthySweep } from './noteworthy';

export const syncSweeperDeclaration: CronRouteDeclaration<CronSyncSweeperResponse> = {
  name: 'cron:sync-sweeper',
  action: 'cron_sync_sweeper',
  capability: 'cron.sync-sweeper',
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

const sweepCountsSchema = z.object({
  dispatched: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
});

async function readSweepCounts(
  response: Response,
): Promise<z.infer<typeof sweepCountsSchema> | null> {
  try {
    const parsed = sweepCountsSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function runSweep(started: number): Promise<CronSyncSweeperResponse> {
  const base = {
    dispatched: null,
    retired: null,
    deleted: null,
  };
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
    const counts = await readSweepCounts(response);
    if (counts === null) {
      return {
        status: 'failed',
        reason: 'sweep_invalid_response',
        ...base,
        durationMs: Date.now() - started,
      };
    }
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
