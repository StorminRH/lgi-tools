import { config } from 'dotenv';
import { readEnv, requireEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PG_CONNECT_TIMEOUT_SECONDS } from '@/db';
import { runScript } from './script-runtime';
import { ingestAndStampSdeVersion } from './sde-ingest-io';

const databaseUrl = requireEnv('DATABASE_URL');
const keepCache = process.argv.includes('--keep-cache');

const client = postgres(databaseUrl, { max: 1, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });

async function main() {
  const db = drizzle(client);
  const { summary, sdeVersion } = await ingestAndStampSdeVersion(db, { keepCache });
  console.log('SDE ingest complete.');
  console.log(JSON.stringify({ ...summary, sdeVersion }, null, 2));
}

runScript(main, { client });
