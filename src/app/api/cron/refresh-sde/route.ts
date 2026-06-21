import { drizzle } from 'drizzle-orm/postgres-js';
import { revalidateTag } from 'next/cache';
import type { CronRefreshSdeResponse } from '@/data/eve-data/api-contract';
import {
  ADVISORY_LOCK_SDE_INGEST,
  BLUEPRINT_STRUCTURE_TAG,
  SDE_META_KEY_VERSION,
} from '@/data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '@/data/eve-data/meta';
import { getRemoteSdeVersion } from '@/data/eve-data/source';
import { logUsageEvent } from '@/data/telemetry/queries';
import { directClient } from '@/db';
import { runSdePipeline, summarizeMarketPricesRowCount } from '@/db/sde-pipeline';
import { requireCronAuth } from '@/lib/cron';

// Awaited fire-and-forget telemetry: failures swallowed so observability never
// breaks the cron, awaited so the row lands before the serverless function
// freezes on return (3.0.10 O-2/O-3).
async function logSdeCronEvent(metadata: Record<string, unknown>): Promise<void> {
  console.log(JSON.stringify({ scope: 'cron:sde', ...metadata }));
  try {
    await logUsageEvent({ action: 'cron_sde', metadata });
  } catch (err) {
    console.error('[cron:sde] telemetry write failed', err);
  }
}

// Vercel cron endpoint. Wired to "0 5 * * *" in vercel.json (daily
// 05:00 UTC — well clear of the 11:00 daily prices cron). Vercel
// dispatches GET with `Authorization: Bearer ${CRON_SECRET}`.
//
// On drift (stored sde_version != CCP's current build number),
// acquires the SDE advisory lock and runs the full pipeline inline:
// JSONL ingest → tree resolver → tracked-types seeding. Vercel Pro
// allows up to 300s per invocation; the full run typically completes
// in ~120s (30s download + 30s ingest + 60s resolver + <5s seeding).
//
// No-drift path returns in <2s — just a GET of CCP's SDE manifest and
// a meta lookup.
export const maxDuration = 300;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_SDE_INGEST);

// No user input — bearer-auth only, no body or query params consumed.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();

  const db = drizzle(directClient);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  if (remoteVersion !== null && storedVersion === remoteVersion) {
    // O-3: the healthy "ran, nothing to do" case — recorded so a no-drift
    // tick is observable, not silence.
    await logSdeCronEvent({
      outcome: 'up-to-date',
      sdeVersion: storedVersion,
      durationMs: Date.now() - start,
    });
    return Response.json({
      status: 'up-to-date',
      sdeVersion: storedVersion,
    } satisfies CronRefreshSdeResponse);
  }

  // CCP-manifest-unreachable path: nothing actionable. Falling through to
  // runSdePipeline would burn ~30s on doomed downloads and emit a noisy
  // 500. The next daily tick (or any sooner manual run) retries. Same
  // guard as src/db/ingest-sde-if-empty.ts.
  if (storedVersion !== null && remoteVersion === null) {
    await logSdeCronEvent({
      outcome: 'remote-unreachable',
      sdeVersion: storedVersion,
      durationMs: Date.now() - start,
    });
    return Response.json({
      status: 'remote-unreachable',
      sdeVersion: storedVersion,
    } satisfies CronRefreshSdeResponse);
  }

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      // O-3: a busy-skip (another ingest holds the lock) is distinct from a
      // healthy run.
      await logSdeCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({
        status: 'busy',
        message: 'Another SDE ingest in flight',
      } satisfies CronRefreshSdeResponse);
    }
    lockHeld = true;

    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    // A re-ingest rebuilds the blueprint trees + flat materials, so bust the
    // cached structure reads (planner trees + the blueprint search index).
    // Deploy-time ingest is covered by the build id; this is the no-deploy
    // daily-drift path that `cacheLife('max')` alone wouldn't refresh.
    revalidateTag(BLUEPRINT_STRUCTURE_TAG, 'max');
    const marketPrices = await summarizeMarketPricesRowCount(db);

    // O-2: the daily re-ingest outcome — counts, durations, version bump.
    await logSdeCronEvent({
      outcome: 'reingested',
      sdeVersionBefore: storedVersion,
      sdeVersionAfter: remoteVersion,
      summary,
      marketPrices,
      durationMs: Date.now() - start,
    });

    return Response.json({
      status: 'reingested',
      sdeVersionBefore: storedVersion,
      sdeVersionAfter: remoteVersion,
      summary,
      marketPrices,
    } satisfies CronRefreshSdeResponse);
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}
