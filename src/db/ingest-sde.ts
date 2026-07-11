import { config } from 'dotenv';
import { readEnv, requireEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { runIngest } from '../data/eve-data/ingest';
import { runScript } from './script-runtime';

const databaseUrl = requireEnv('DATABASE_URL');
const keepCache = process.argv.includes('--keep-cache');

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);
  const summary = await runIngest(db, { keepCache });
  console.log('SDE ingest complete.');
  console.log(JSON.stringify(summary, null, 2));
}

runScript(main, { client });
