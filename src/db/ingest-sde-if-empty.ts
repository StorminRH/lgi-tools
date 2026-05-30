// Deploy-time SDE gate. Runs on every `pnpm vercel-build`. Skips the
// full pipeline when:
//   (a) the eve-data tables are populated AND
//   (b) the stored `sde_version` matches Fuzzwork's current
//       Last-Modified on invTypes.csv.bz2
//
// On a brand-new branch (e.g. a fresh preview Neon), case (a) fails
// and we ingest. On a steady-state redeploy with no SDE patch, both
// pass and we no-op in <1s. When CCP has patched the SDE between
// deploys, case (b) fails and we re-ingest — the weekly drift cron
// is the primary path for this, but the build-time check is the
// belt-and-braces.
//
// Failures are SOFT — the build continues. Per-NPC combat stats and
// industry tree data degrade to nulls until a successful subsequent
// run; the rest of the app keeps working.

import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  ADVISORY_LOCK_SDE_INGEST,
  SDE_META_KEY_VERSION,
} from '../data/eve-data/constants';
import {
  getSdeMetaValue,
  setSdeMetaValue,
} from '../data/eve-data/queries';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { resolveAllTrees } from '../data/eve-data/tree-resolver';
import { resolveLockConnectionUrl } from './index';
import { runSdePipeline } from './sde-pipeline';

if (!process.env.DATABASE_URL) {
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

  // Migration order means the dgm_type_attributes table always exists
  // when this runs — kept the existence check for the case where this
  // ever runs against a pre-migration DB.
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

    const [{ rowCount }] = await db.execute<{ rowCount: string }>(sql`
      SELECT COUNT(*)::text AS "rowCount" FROM dgm_type_attributes
    `);
    const hasRows = Number(rowCount) > 0;

    const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
    const remoteVersion = await getRemoteSdeVersion();

    const sdeCurrent =
      hasRows &&
      storedVersion !== null &&
      (remoteVersion === null || storedVersion === remoteVersion);

    if (sdeCurrent) {
      console.log(
        remoteVersion === null
          ? `SDE ingest skipped (Fuzzwork unreachable; staying on stored version "${storedVersion}", ${rowCount} attribute rows present).`
          : `SDE ingest skipped (already at SDE version "${storedVersion}", ${rowCount} attribute rows present).`,
      );
      // The SDE *data* is current, but the resolver's algorithm may have
      // changed — its hash is now versioned, so this self-gates to an instant
      // no-op unless the math changed, in which case it rebuilds the flat
      // materials + trees here at deploy time instead of waiting for the cron.
      const resolve = await resolveAllTrees(db);
      console.log(
        resolve.skipped
          ? 'Tree resolver: up to date (no rebuild).'
          : `Tree resolver: rebuilt ${resolve.flatMaterialsWritten} flat-material rows across ${resolve.blueprintsResolved} blueprints.`,
      );
      return;
    }

    if (!hasRows) {
      console.log('Auto-ingesting SDE (eve-data tables empty on this branch)…');
    } else if (storedVersion !== remoteVersion) {
      console.log(
        `Auto-ingesting SDE (drift detected: stored=${storedVersion ?? '<none>'} remote=${remoteVersion ?? '<unreachable>'}).`,
      );
    }

    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    console.log('SDE pipeline complete.');
    console.log(JSON.stringify(summary, null, 2));
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
