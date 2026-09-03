import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { refreshStalePrices } from '../data/market-prices/cache';
import { refreshPrices } from '../data/market-prices/ingest';
import { getPrices } from '../data/market-prices/queries';
import { PG_CONNECT_TIMEOUT_SECONDS, resolveLockConnectionUrl } from '@/db';
import { parseArgs } from './refresh-prices-args';
import { runScript } from './script-runtime';

const mode = parseArgs(process.argv.slice(2));

const client = postgres(resolveLockConnectionUrl(), { max: 5, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });

async function main() {
  const db = drizzle(client);

  if (mode.kind === 'explicit') {
    const summary = await refreshPrices(db, mode.ids);
    console.log('Refresh complete (explicit IDs, no cache).');
    console.log(JSON.stringify(summary, null, 2));

    const map = await getPrices(mode.ids);
    const readback = mode.ids.map((id) => map.get(id) ?? { typeId: id, missing: true });
    console.log('Read-back via getPrices:');

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
