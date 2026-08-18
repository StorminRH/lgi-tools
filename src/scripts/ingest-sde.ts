import { config } from 'dotenv';
import { readEnv, requireEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PG_CONNECT_TIMEOUT_SECONDS } from '@/db';
import { SDE_META_KEY_VERSION } from '../data/eve-data/constants';
import { runIngest } from '../data/eve-data/ingest';
import { setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import { runScript } from './script-runtime';

const databaseUrl = requireEnv('DATABASE_URL');
const keepCache = process.argv.includes('--keep-cache');

const client = postgres(databaseUrl, { max: 1, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });

async function main() {
  const db = drizzle(client);
  const summary = await runIngest(db, { keepCache });
  const remoteVersion = await getRemoteSdeVersion();
  if (!remoteVersion) {
    throw new Error(
      'SDE ingest succeeded but the CCP version manifest did not return a build number.',
    );
  }
  await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
  console.log('SDE ingest complete.');
  console.log(JSON.stringify({ ...summary, sdeVersion: remoteVersion }, null, 2));
}

runScript(main, { client });
