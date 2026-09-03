import { sql } from 'drizzle-orm';
import type { PostgresJsDb } from '@/lib/db-types';
import { SDE_META_KEY_VERSION } from '../data/eve-data/constants';
import { runIngest, type IngestSummary } from '../data/eve-data/ingest';
import { setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import type { SdeRowCounts } from './sde-bootstrap';

export async function readSdeSentinelCounts(db: PostgresJsDb): Promise<SdeRowCounts> {
  const [countsRow] = await db.execute<{
    rowCount: string;
    universeRowCount: string;
    jumpsRowCount: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM type_dogma)::text AS "rowCount",
      (SELECT COUNT(*) FROM eve_npc_stations)::text AS "universeRowCount",
      (SELECT COUNT(*) FROM eve_system_jumps)::text AS "jumpsRowCount"
  `);
  if (!countsRow) throw new Error('SDE sentinel count query returned no row');
  return {
    typeDogma: Number(countsRow.rowCount),
    npcStations: Number(countsRow.universeRowCount),
    systemJumps: Number(countsRow.jumpsRowCount),
  };
}

export async function ingestAndStampSdeVersion(
  db: PostgresJsDb,
  options: { keepCache?: boolean; remoteVersion?: string | null } = {},
): Promise<{ summary: IngestSummary; sdeVersion: string }> {
  const summary = await runIngest(db, { keepCache: options.keepCache });
  const sdeVersion = options.remoteVersion ?? (await getRemoteSdeVersion());
  if (!sdeVersion) {
    throw new Error(
      'SDE ingest succeeded but the CCP version manifest did not return a build number.',
    );
  }
  await setSdeMetaValue(db, SDE_META_KEY_VERSION, sdeVersion);
  return { summary, sdeVersion };
}
