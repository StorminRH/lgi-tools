import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { refreshKnownPricesIfStale } from '../data/market-prices/cache';
import { refreshPrices } from '../data/market-prices/ingest';
import { getPrices } from '../data/market-prices/queries';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Sanity trio: Tritanium / Pyerite / Mexallon. Always have deep
// order books in Jita on both sides — a useful smoke-test default
// when the operator passes explicit IDs.
const DEFAULT_DEBUG_IDS = [34, 35, 36];

function parseIds(arg: string): number[] {
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

type Mode =
  | { kind: 'cached'; force: boolean }
  | { kind: 'explicit'; ids: number[] };

function parseArgs(argv: string[]): Mode {
  // Recognized argv shapes:
  //   (none)         → cached path (respects 24h cache)
  //   --force        → cached path, force=true
  //   34,35,36       → explicit IDs, unconditional refresh
  //   --debug        → explicit IDs (DEFAULT_DEBUG_IDS), unconditional
  let force = false;
  let debug = false;
  let idsArg: string | undefined;
  for (const a of argv) {
    if (a === '--force') force = true;
    else if (a === '--debug') debug = true;
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else idsArg = a;
  }
  if (idsArg) return { kind: 'explicit', ids: parseIds(idsArg) };
  if (debug) return { kind: 'explicit', ids: DEFAULT_DEBUG_IDS };
  return { kind: 'cached', force };
}

const databaseUrl = requiredEnv('DATABASE_URL');
const mode = parseArgs(process.argv.slice(2));

const client = postgres(databaseUrl, { max: 1 });

async function main() {
  const db = drizzle(client);

  if (mode.kind === 'explicit') {
    const summary = await refreshPrices(db, mode.ids);
    console.log('Refresh complete (explicit IDs, no cache).');
    console.log(JSON.stringify(summary, null, 2));

    const map = await getPrices(mode.ids);
    const readback = mode.ids.map((id) => map.get(id) ?? { typeId: id, missing: true });
    console.log('Read-back via getPrices:');
    console.log(JSON.stringify(readback, null, 2));
    return;
  }

  const result = await refreshKnownPricesIfStale(db, { force: mode.force });
  if (result.status === 'cached') {
    console.log('Cached — no Fuzzwork call.');
    console.log(JSON.stringify({
      lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    }, null, 2));
    return;
  }

  console.log(`Refresh complete${mode.force ? ' (--force)' : ''}.`);
  console.log(JSON.stringify({
    lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    ...result.summary,
  }, null, 2));
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
