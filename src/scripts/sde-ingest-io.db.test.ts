import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import type { PostgresJsDb } from '@/lib/db-types';
import { hasCompleteSdeData } from './sde-bootstrap';
import { readSdeSentinelCounts } from './sde-ingest-io';

const legacyTables = ['type_dogma', 'eve_npc_stations', 'eve_system_jumps'] as const;
const industryTables = [
  'industry_target_filters',
  'industry_modifiers',
  'industry_assembly_lines',
  'industry_installation_types',
] as const;

const harness = await createDbTestHarness({
  schema: 'test_sde_sentinel_counts',
  tables: [...legacyTables, ...industryTables],
});

describe.skipIf(!harness.reachable)('readSdeSentinelCounts', () => {
  it('requires a fresh import when legacy SDE data exists but industry rules are empty', async () => {
    for (const table of legacyTables) {
      await harness.sql.unsafe(`INSERT INTO "${table}" SELECT * FROM public."${table}" LIMIT 1`);
    }

    const db = harness.db as PostgresJsDb;
    const beforeImport = await readSdeSentinelCounts(db);
    expect(beforeImport).toEqual({
      typeDogma: 1,
      npcStations: 1,
      systemJumps: 1,
      industryTargetFilters: 0,
      industryModifiers: 0,
      industryAssemblyLines: 0,
      industryInstallationTypes: 0,
    });
    expect(hasCompleteSdeData(beforeImport)).toBe(false);

    for (const table of industryTables) {
      await harness.sql.unsafe(`INSERT INTO "${table}" SELECT * FROM public."${table}" LIMIT 1`);
    }

    expect(hasCompleteSdeData(await readSdeSentinelCounts(db))).toBe(true);
  });
});
