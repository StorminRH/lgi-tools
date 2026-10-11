import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { requireEnv } from '@/lib/env';
import { createScriptClient, runScript } from './script-runtime';
import { ingestAndStampSdeVersion } from './sde-ingest-io';

const databaseUrl = requireEnv('DATABASE_URL');
const keepCache = process.argv.includes('--keep-cache');

const client = createScriptClient(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);
  const { summary, sdeVersion } = await ingestAndStampSdeVersion(db, { keepCache });
  console.log('SDE ingest complete.');
  console.log(JSON.stringify({ ...summary, sdeVersion }, null, 2));
}

runScript(main, { client });
