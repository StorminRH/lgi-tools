import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { refreshStalePrices } from '../data/market-prices/cache';
import { refreshPrices } from '../data/market-prices/ingest';
import { getPrices } from '../data/market-prices/queries';
import { resolveLockConnectionUrl } from './index';

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
  | { kind: 'cached' }
  | { kind: 'explicit'; ids: number[] };

function parseArgs(argv: string[]): Mode {
  // Recognized argv shapes:
  //   (none)         → stale sweep (only rows past their TTL)
  //   34,35,36       → explicit IDs, unconditional refresh
  //   --debug        → explicit IDs (DEFAULT_DEBUG_IDS), unconditional
  let debug = false;
  let idsArg: string | undefined;
  for (const a of argv) {
    if (a === '--debug') debug = true;
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else idsArg = a;
  }
  if (idsArg) return { kind: 'explicit', ids: parseIds(idsArg) };
  if (debug) return { kind: 'explicit', ids: DEFAULT_DEBUG_IDS };
  return { kind: 'cached' };
}

const mode = parseArgs(process.argv.slice(2));

// Direct (unpooled) endpoint via resolveLockConnectionUrl — prefers
// DATABASE_URL_UNPOOLED and fails closed on a pooled host. The bulk upsert
// runs fine on the direct endpoint, which this shared resolver hands us.
//
// max: 5 gives headroom for the parallel bulk-upsert against the ~6,000-type
// tracked set (bumped from 2 in 3.0.4 when the set grew).
const client = postgres(resolveLockConnectionUrl(), { max: 5 });

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

  const result = await refreshStalePrices(client);
  if (result.status === 'cached') {
    console.log('Nothing stale — no Fuzzwork call.');
    console.log(JSON.stringify({
      lastUpdatedAt: result.lastUpdatedAt?.toISOString() ?? null,
    }, null, 2));
    return;
  }

  console.log('Refresh complete.');
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
