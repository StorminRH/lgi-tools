// Manual recovery hook for the SDE drift cron. Same logic as
// /api/cron/refresh-sde — checks the stored sde_version against
// CCP's current SDE build number and re-ingests on drift. Useful
// when the daily cron didn't fire, when the operator wants to force
// a re-resolve after a resolver code change (use --force), or when
// debugging the drift path locally.
//
// Run:
//   pnpm db:refresh-sde            (drift-aware, against .env.local)
//   pnpm db:refresh-sde --force    (re-ingest regardless of version)
//   pnpm db:refresh-sde:prod       (against .env.production.local)

import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  ADVISORY_LOCK_SDE_INGEST,
  SDE_META_KEY_VERSION,
} from '../data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { withAdvisoryLock } from './advisory-lock';
import { resolveLockConnectionUrl } from './index';
import { runScript } from './script-runtime';
import { formatSdeVersions, shouldReingestSde } from './sde-bootstrap';
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

  console.log(formatSdeVersions(storedVersion, remoteVersion));

  if (!shouldReingestSde(storedVersion, remoteVersion, force)) {
    console.log('No drift — nothing to do. (Use --force to re-ingest anyway.)');
    return;
  }

  const outcome = await withAdvisoryLock(client, LOCK_KEY_NUM, async () => {
    console.log(force ? 'Re-ingesting (--force)…' : 'Drift detected — re-ingesting…');
    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    const marketPrices = await summarizeMarketPricesRowCount(db);
    console.log('SDE pipeline complete.');
    console.log(JSON.stringify({ summary, marketPrices }, null, 2));
  });

  if (outcome.busy) {
    console.log('Could not acquire advisory lock — another ingest in flight. Aborting.');
  }
}

runScript(main, { client });
