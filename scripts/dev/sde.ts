import { execFileSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { SDE_META_KEY_VERSION } from '../../src/data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '../../src/data/eve-data/meta';
import { getRemoteSdeVersion } from '../../src/data/eve-data/source';
import { hasCompleteSdeData } from '../../src/scripts/sde-bootstrap';
import { readSdeSentinelCounts } from '../../src/scripts/sde-ingest-io';
import { sourceIdentity, baselineMatches } from './source-identity.mjs';

const client = postgres(process.env.DATABASE_URL ?? '', { max: 1, connect_timeout: 10 });
const db = drizzle(client);
const identityKey = 'dev_bootstrap_sde_identity';

async function complete(): Promise<boolean> {
  if (!hasCompleteSdeData(await readSdeSentinelCounts(db))) return false;
  const rows = await db.execute<{ present: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM market_prices) AS present`);
  return rows[0]?.present === true;
}

async function main(): Promise<void> {
  const server = await db.execute<{ major: number }>(sql`SELECT current_setting('server_version_num')::int / 10000 AS major`);
  if (server[0]?.major !== 16) throw new Error('Development database must use PostgreSQL 16');
  const source = sourceIdentity();
  const version = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const stored = await getSdeMetaValue(db, identityKey);
  const checkOnly = process.argv.includes('--check');
  const remote = checkOnly ? version : await getRemoteSdeVersion();
  if (!checkOnly && !remote) throw new Error('Cannot reconcile SDE without a current CCP version manifest');
  if (baselineMatches(source, version, stored, await complete(), remote)) {
    console.log(`SDE baseline verified: source ${source.slice(0, 12)}, version ${version}`);
  } else {
    if (checkOnly) throw new Error('SDE baseline needs reconciliation');
    execFileSync('pnpm', ['db:refresh-sde', '--force'], { stdio: 'inherit', env: process.env });
    if (!await complete() || await getSdeMetaValue(db, SDE_META_KEY_VERSION) !== remote) throw new Error('SDE reconciliation did not produce a complete matching version');
    await setSdeMetaValue(db, identityKey, `${source}:${remote}`);
    console.log(`SDE baseline reconciled: source ${source.slice(0, 12)}, version ${remote}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'SDE bootstrap failed');
  process.exitCode = 1;
}).finally(() => client.end());
