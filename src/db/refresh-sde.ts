// Manual recovery hook for the SDE drift cron. Same logic as
// /api/cron/refresh-sde — checks the stored sde_version against
// CCP's current SDE build number and re-ingests on drift. Useful
// when the weekly cron didn't fire, when the operator wants to force
// a re-resolve after a resolver code change (use --force), or when
// debugging the drift path locally.
//
// Run:
//   pnpm db:refresh-sde            (drift-aware, against .env.local)
//   pnpm db:refresh-sde --force    (re-ingest regardless of version)
//   pnpm db:refresh-sde:prod       (against .env.production.local)

import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

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
import { resolveLockConnectionUrl } from './index';
import { runSdePipeline, summarizeMarketPricesRowCount } from './sde-pipeline';

const force = process.argv.includes('--force');

// Direct (unpooled) endpoint — the SDE ingest advisory lock is
// session-scoped and won't hold through the `-pooler` endpoint.
// max: 2 — one for the advisory lock, one for the data ops.
const client = postgres(resolveLockConnectionUrl(), { max: 2 });
const LOCK_KEY_NUM = Number(ADVISORY_LOCK_SDE_INGEST);

async function main() {
  const db = drizzle(client);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  console.log(`SDE version stored=${storedVersion ?? '<none>'} remote=${remoteVersion ?? '<unreachable>'}`);

  if (!force && remoteVersion !== null && storedVersion === remoteVersion) {
    console.log('No drift — nothing to do. (Use --force to re-ingest anyway.)');
    return;
  }

  const reserved = await client.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      console.log('Could not acquire advisory lock — another ingest in flight. Aborting.');
      return;
    }
    lockHeld = true;

    console.log(force ? 'Re-ingesting (--force)…' : 'Drift detected — re-ingesting…');
    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    const marketPrices = await summarizeMarketPricesRowCount(db);
    console.log('SDE pipeline complete.');
    console.log(JSON.stringify({ summary, marketPrices }, null, 2));
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
    console.error(err);
    await client.end().catch(() => undefined);
    process.exit(1);
  });
