// Deploy-time SDE BOOTSTRAP. Runs on every `pnpm vercel-build`, but only
// ingests when the eve-data tables are empty or incomplete — a brand-new branch
// (a fresh preview Neon) or the first prod deploy that ships these tables. That
// bootstrap is load-bearing: `next build` prerenders SDE-backed static content
// (the blueprint search index, etc.), which needs the data present.
//
// It deliberately does NOT re-ingest on CCP version DRIFT. A full pipeline run
// is a ~15s burst of DB writes, and running it immediately before prerender
// loads the DB enough to stall the prerender's own reads (the 3.6.27
// deploy-timeout root cause). Drift is the daily `refresh-sde` cron's job — it
// re-ingests AND revalidates the SDE-tagged caches — so a deploy that coincides
// with a new CCP SDE build simply ships the prior data, and the cron updates it
// (and the cached static reads) within a day. The resolver-algorithm rebuild
// below still runs at deploy time (it's lightweight and self-gates on the
// resolver's code hash, not on the SDE data).
//
// Failures are SOFT — the build continues. Per-NPC combat stats and industry
// tree data degrade to nulls until a successful subsequent run; the rest of the
// app keeps working.

import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  ADVISORY_LOCK_SDE_INGEST,
  SDE_META_KEY_VERSION,
} from '../data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { resolveAllTrees } from '../data/eve-data/tree-resolver';
import { resolveLockConnectionUrl } from './index';
import { runSdePipeline } from './sde-pipeline';

if (!readEnv('DATABASE_URL')) {
  console.log('Skipping SDE auto-ingest (DATABASE_URL is not set).');
  process.exit(0);
}

// Direct (unpooled) endpoint — the SDE ingest advisory lock is
// session-scoped and won't hold through the `-pooler` endpoint. Resolved
// here (not inside main) so the fail-closed throw soft-skips the
// build-time ingest rather than failing the build.
let lockUrl: string;
try {
  lockUrl = resolveLockConnectionUrl();
} catch (err) {
  console.error('Skipping SDE auto-ingest (build continues):', err);
  process.exit(0);
}

// max: 2 — one connection holds the advisory lock, the other runs the
// data ops. Same pattern as src/db/refresh-prices.ts.
const client = postgres(lockUrl, { max: 2 });
const LOCK_KEY_NUM = Number(ADVISORY_LOCK_SDE_INGEST);

async function main() {
  const db = drizzle(client);

  // Migration order means the eve-data tables always exist when this runs —
  // kept the existence check for the case where this ever runs against a
  // pre-migration DB.
  const [{ exists }] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'eve_data_meta'
    ) AS exists
  `);
  if (!exists) {
    console.log('Skipping SDE auto-ingest (eve_data_meta does not exist; migration pending).');
    return;
  }

  const reserved = await client.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      console.log('Skipping SDE auto-ingest (advisory lock held — another ingest in flight).');
      return;
    }
    lockHeld = true;

    // "Populated" means EVERY SDE dataset is present, not just the original
    // type/blueprint set. `eve_npc_stations` is the sentinel for the universe
    // tables (3.5.1a) — it's the last table the ingest writes, so its presence
    // implies the whole universe emit completed. Without this, a DB that
    // already has a current SDE (every existing branch, and prod at the merge
    // that first ships these tables) would skip the ingest and leave the freshly
    // migrated universe tables empty until the next CCP drift.
    const [{ rowCount, universeRowCount }] = await db.execute<{
      rowCount: string;
      universeRowCount: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM type_dogma)::text AS "rowCount",
        (SELECT COUNT(*) FROM eve_npc_stations)::text AS "universeRowCount"
    `);
    const hasRows = Number(rowCount) > 0 && Number(universeRowCount) > 0;

    const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
    const remoteVersion = await getRemoteSdeVersion();

    // Empty/incomplete tables — a fresh preview Neon or the first prod deploy
    // shipping these tables. Bootstrap the full pipeline so the build can
    // prerender SDE-backed static content.
    if (!hasRows) {
      console.log('Auto-ingesting SDE (eve-data tables empty or incomplete on this branch)…');
      const summary = await runSdePipeline(db);
      if (remoteVersion) {
        await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
      }
      console.log('SDE pipeline complete.');
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    // Tables are populated: never re-ingest at build time. If CCP has drifted,
    // the daily refresh-sde cron owns the re-ingest + cache revalidation (a
    // mid-build pipeline run would load the DB and stall the prerender — the
    // 3.6.27 deploy-timeout cause), so just record why we're standing down.
    const drifted = remoteVersion !== null && storedVersion !== remoteVersion;
    console.log(
      drifted
        ? `SDE re-ingest deferred to the daily cron (drift: stored=${storedVersion ?? '<none>'} remote=${remoteVersion}; ${rowCount} attribute rows present).`
        : remoteVersion === null
          ? `SDE ingest skipped (CCP SDE manifest unreachable; staying on stored version "${storedVersion}", ${rowCount} attribute rows present).`
          : `SDE ingest skipped (already at SDE version "${storedVersion}", ${rowCount} attribute rows present).`,
    );

    // The SDE *data* is left as-is, but the resolver's ALGORITHM may have
    // changed — its hash self-gates this to an instant no-op unless the math
    // changed, in which case it rebuilds the flat materials + trees here at
    // deploy time instead of waiting for the cron. (Lightweight; not a re-ingest.)
    const resolve = await resolveAllTrees(db);
    console.log(
      resolve.skipped
        ? 'Tree resolver: up to date (no rebuild).'
        : `Tree resolver: rebuilt ${resolve.flatMaterialsWritten} flat-material rows across ${resolve.blueprintsResolved} blueprints.`,
    );
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    // Soft failure: log, close cleanly, exit 0. The build continues.
    console.error('SDE auto-ingest failed (build continues):', err);
    await client.end().catch(() => undefined);
    process.exit(0);
  });
