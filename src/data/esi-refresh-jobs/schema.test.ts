import { readFileSync } from 'node:fs';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { esiRefreshJobs } from './schema';

const LIVE_KEY_INDEX = 'esi_refresh_jobs_live_key_unique';

interface Snapshot {
  tables: Record<string, { indexes: Record<string, { where?: string }> }>;
}

function latestSnapshot(): Snapshot {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: { idx: number }[];
  };
  const latest = journal.entries.at(-1);
  if (latest === undefined) throw new Error('expected a migration journal entry');
  const file = `drizzle/meta/${String(latest.idx).padStart(4, '0')}_snapshot.json`;
  return JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
}

test('renders the live-key index predicate exactly as the latest migration snapshot stores it', () => {
  const stored =
    latestSnapshot().tables['public.esi_refresh_jobs']?.indexes[LIVE_KEY_INDEX]?.where;
  const where = getTableConfig(esiRefreshJobs).indexes.find(
    (index) => index.config.name === LIVE_KEY_INDEX,
  )?.config.where;
  if (stored === undefined || where === undefined) {
    throw new Error('expected the live-key partial index in the schema and the snapshot');
  }

  // drizzle-kit renders the predicate this way and rebuilds the index on any
  // difference, so the statuses must be inlined, quoted and in snapshot order.
  expect(new PgDialect().sqlToQuery(where)).toEqual({ sql: stored, params: [] });
});
