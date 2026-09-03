import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  ADVISORY_LOCK_SDE_INGEST,
  SDE_META_KEY_VERSION,
} from '../data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { resolveAllTrees } from '../data/eve-data/tree-resolver';
import { withAdvisoryLock } from '@/db/advisory-lock';
import { requireSoftFailLockClient, runScript } from './script-runtime';
import { describeSdeStandDown, hasCompleteSdeData } from './sde-bootstrap';
import { readSdeSentinelCounts } from './sde-ingest-io';
import { runSdePipeline } from '@/composition/pipelines/sde-pipeline';

const client = requireSoftFailLockClient(
  'Skipping SDE auto-ingest (DATABASE_URL is not set).',
  'Skipping SDE auto-ingest (build continues):',
);
const LOCK_KEY_NUM = Number(ADVISORY_LOCK_SDE_INGEST);

async function ingestUnderLock(db: ReturnType<typeof drizzle>): Promise<void> {
  const counts = await readSdeSentinelCounts(db);
  const complete = hasCompleteSdeData(counts);

  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  if (!complete) {
    console.log('Auto-ingesting SDE (eve-data tables empty or incomplete on this branch)…');
    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    console.log('SDE pipeline complete.');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(describeSdeStandDown(storedVersion, remoteVersion, String(counts.typeDogma)));

  const resolve = await resolveAllTrees(db);
  console.log(
    resolve.skipped
      ? 'Tree resolver: up to date (no rebuild).'
      : `Tree resolver: rebuilt ${resolve.flatMaterialsWritten} flat-material rows across ${resolve.blueprintsResolved} blueprints.`,
  );
}

async function main() {
  const db = drizzle(client);

  const [metaRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'eve_data_meta'
    ) AS exists
  `);
  if (!metaRow) throw new Error('eve_data_meta existence check returned no row');
  if (!metaRow.exists) {
    console.log('Skipping SDE auto-ingest (eve_data_meta does not exist; migration pending).');
    return;
  }

  const outcome = await withAdvisoryLock(client, LOCK_KEY_NUM, () => ingestUnderLock(db));
  if (outcome.busy) {
    console.log('Skipping SDE auto-ingest (advisory lock held — another ingest in flight).');
  }
}

runScript(main, { client, softFail: true });
