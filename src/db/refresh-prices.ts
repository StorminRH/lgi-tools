import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { refreshPrices } from '../data/market-prices/ingest';
import { getPrices } from '../data/market-prices/queries';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Sanity trio: Tritanium / Pyerite / Mexallon. Always have deep
// order books in Jita on both sides — a useful smoke-test default.
const DEFAULT_IDS = [34, 35, 36];

function parseIds(arg: string | undefined): number[] {
  if (!arg) return DEFAULT_IDS;
  const ids = arg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n)) throw new Error(`Invalid type ID: "${s}"`);
      return n;
    });
  if (ids.length === 0) throw new Error('No type IDs supplied');
  return ids;
}

const databaseUrl = requiredEnv('DATABASE_URL');
const ids = parseIds(process.argv[2]);

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);
  const summary = await refreshPrices(db, ids);
  console.log('Refresh complete.');
  console.log(JSON.stringify(summary, null, 2));

  // Round-trip read so we can see the public query API agrees with
  // what was just written.
  const map = await getPrices(ids);
  const readback = ids.map((id) => map.get(id) ?? { typeId: id, missing: true });
  console.log('Read-back via getPrices:');
  console.log(JSON.stringify(readback, null, 2));
}

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
