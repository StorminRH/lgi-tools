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

// Explicit exit — Session B documented a tsx + postgres-js hang where the
// event loop stays alive long after `client.end()` resolves. Adding the
// Fuzzwork network call to runIngest could resurface it; force a clean exit.
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
