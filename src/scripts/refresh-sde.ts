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
import { withAdvisoryLock } from '@/db/advisory-lock';
import { PG_CONNECT_TIMEOUT_SECONDS, resolveLockConnectionUrl } from '@/db';
import { runScript } from './script-runtime';
import { formatSdeVersions, shouldReingestSde } from './sde-bootstrap';
import {
  runSdePipeline,
  summarizeMarketPricesRowCount,
} from '@/composition/pipelines/sde-pipeline';

const force = process.argv.includes('--force');

const client = postgres(resolveLockConnectionUrl(), { max: 2, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });
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
