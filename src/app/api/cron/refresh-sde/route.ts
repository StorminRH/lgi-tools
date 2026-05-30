import { drizzle } from 'drizzle-orm/postgres-js';
import {
  ADVISORY_LOCK_SDE_INGEST,
  SDE_META_KEY_VERSION,
} from '@/data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '@/data/eve-data/queries';
import { getRemoteSdeVersion } from '@/data/eve-data/source';
import { connection } from 'next/server';
import { directClient } from '@/db';
import { runSdePipeline, summarizeMarketPricesRowCount } from '@/db/sde-pipeline';

// Vercel cron endpoint. Wired to "0 5 * * 1" in vercel.json (Mondays
// 05:00 UTC — well clear of the 11:00 daily prices cron). Vercel
// dispatches GET with `Authorization: Bearer ${CRON_SECRET}`.
//
// On drift (stored sde_version != Fuzzwork's current Last-Modified),
// acquires the SDE advisory lock and runs the full pipeline inline:
// CSV ingest → tree resolver → tracked-types seeding. Vercel Pro
// allows up to 300s per invocation; the full run typically completes
// in ~120s (30s download + 30s ingest + 60s resolver + <5s seeding).
//
// No-drift path returns in <2s — just a HEAD request to Fuzzwork and
// a meta lookup.
export const maxDuration = 300;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_SDE_INGEST);

// No user input — bearer-auth only, no body or query params consumed.
export async function GET(req: Request): Promise<Response> {
  // Cron endpoint: runs per-invocation and writes. Defer to request time so
  // Cache Components doesn't try to prerender it.
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = drizzle(directClient);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  if (remoteVersion !== null && storedVersion === remoteVersion) {
    return Response.json({
      status: 'up-to-date',
      sdeVersion: storedVersion,
    });
  }

  // Fuzzwork-unreachable path: nothing actionable. Falling through to
  // runSdePipeline would burn ~30s on doomed downloads and emit a noisy
  // 500. Next Monday's tick (or any sooner manual run) retries. Same
  // guard as src/db/ingest-sde-if-empty.ts.
  if (storedVersion !== null && remoteVersion === null) {
    return Response.json({
      status: 'remote-unreachable',
      sdeVersion: storedVersion,
    });
  }

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      return Response.json({
        status: 'busy',
        message: 'Another SDE ingest in flight',
      });
    }
    lockHeld = true;

    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    const marketPrices = await summarizeMarketPricesRowCount(db);

    return Response.json({
      status: 'reingested',
      sdeVersionBefore: storedVersion,
      sdeVersionAfter: remoteVersion,
      summary,
      marketPrices,
    });
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}
