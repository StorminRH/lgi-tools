import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { refreshStalePrices } from '../data/market-prices/cache';
import { refreshPrices } from '../data/market-prices/ingest';
import { getPrices } from '../data/market-prices/queries';
import { resolveLockConnectionUrl } from '@/db';
import { parseArgs } from './refresh-prices-args';
import { runScript } from './script-runtime';

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
    // Price rows carry bigint volume columns; JSON.stringify throws on a BigInt,
    // so coerce them to number for the log (volumes stay well under MAX_SAFE_INTEGER).
    console.log(
      JSON.stringify(readback, (_key, value) => (typeof value === 'bigint' ? Number(value) : value), 2),
    );
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

runScript(main, { client });
