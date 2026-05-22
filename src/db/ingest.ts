import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { runIngest } from '../features/wormhole-sites/ingest';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const databaseUrl = requiredEnv('DATABASE_URL');
const pubKey = requiredEnv('SHEET_PUB_KEY');
const prune = !process.argv.includes('--no-prune');

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);
  const start = Date.now();
  const summary = await runIngest(db, { pubKey, prune });
  const ms = Date.now() - start;
  console.log('Ingest complete in', ms, 'ms');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
