import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { SDE_META_KEY_VERSION } from '../data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { ADVISORY_LOCKS, withAdvisoryLock } from '@/db/advisory-lock';
import { resolveLockConnectionUrl } from '@/db';
import { createScriptClient, runScript } from './script-runtime';
import { formatSdeVersions, shouldReingestSde } from './sde-bootstrap';
import {
  runSdePipeline,
  summarizeMarketPricesRowCount,
} from '@/composition/pipelines/sde-pipeline';

const force = process.argv.includes('--force');

const client = createScriptClient(resolveLockConnectionUrl(), { max: 2 });

async function main() {
  const db = drizzle(client);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  console.log(formatSdeVersions(storedVersion, remoteVersion));

  if (!shouldReingestSde(storedVersion, remoteVersion, force)) {
    console.log('No drift — nothing to do. (Use --force to re-ingest anyway.)');
    return;
  }

  const outcome = await withAdvisoryLock(client, ADVISORY_LOCKS.sdeIngest, async () => {
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
