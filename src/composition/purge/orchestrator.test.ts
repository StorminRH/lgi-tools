// Orchestrator ordering + contributor-coverage test. A recording mock of @/db (the
// queries.owner.test.ts house pattern) captures the table behind every delete/update
// the contributors issue, so we can assert tier ordering (credential → cache →
// durable) and that the transfer scope touches exactly the credential tables — the
// guarantee that keeps the byte-identical owner-purge oracle green. Running both
// subject kinds across all tiers also exercises every contributor's teardown.
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, recorded } = vi.hoisted(() => {
  const recorded: { op: 'delete' | 'update'; table: unknown }[] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve([]),
  };
  for (const method of ['set', 'where', 'returning', 'from', 'limit', 'orderBy']) {
    chain[method] = () => chain;
  }
  chain.delete = (table: unknown) => {
    recorded.push({ op: 'delete', table });
    return chain;
  };
  chain.update = (table: unknown) => {
    recorded.push({ op: 'update', table });
    return chain;
  };
  return { chain, recorded };
});

vi.mock('@/db', () => ({ db: chain }));

// Maps purge now captures affected map ids before deleting; unit tests that only
// assert Neon delete order stub those reads empty so the mock db chain stays delete-only.
vi.mock('@/data/maps/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/maps/queries')>();
  return {
    ...actual,
    getCharacterCorporationId: vi.fn().mockResolvedValue(null),
    getMapIdsWithCharacterGrant: vi.fn().mockResolvedValue([]),
    getMapIdsWithCorporationGrants: vi.fn().mockResolvedValue([]),
    getOwnedMapIds: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: vi.fn().mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  }),
  teardownMapAccessProjection: vi.fn().mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  }),
  purgeUserMapAccessProjection: vi.fn().mockResolvedValue({ deleted: 0 }),
}));

import { runPurge } from './orchestrator';

const names = (): string[] => recorded.map((r) => getTableConfig(r.table as PgTable).name);

beforeEach(() => {
  recorded.length = 0;
});

describe('runPurge orchestrator', () => {
  it('transfer scope removes auth custody and direct map grants at the credential tier', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 }, ['credential']);
    expect(names()).toEqual(['account', 'characters', 'map_access']);
  });

  it('full character purge runs credentials before the regenerable caches', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 });
    const seq = names();
    expect(seq[0]).toBe('account');
    expect(seq[1]).toBe('characters');
    expect(seq[2]).toBe('map_access');
    for (const cacheTable of [
      'character_skills',
      'character_skill_syncs',
      'character_industry_jobs',
      'character_industry_job_syncs',
      'owned_assets',
      'owned_asset_syncs',
      'owned_blueprints',
      'owned_blueprint_syncs',
      'usage_logs',
    ]) {
      expect(seq).toContain(cacheTable);
    }
    expect(seq.indexOf('account')).toBeLessThan(seq.indexOf('character_skills'));
    // A character purge never touches the per-user tables.
    expect(seq).not.toContain('corp_industry_jobs');
    expect(seq).not.toContain('user_preferences');
    expect(seq).not.toContain('custom_structures');
  });

  it('user purge runs the per-user caches before the durable tier, never the per-character ones', async () => {
    await runPurge({ kind: 'user', userId: 'u1' });
    const seq = names();
    for (const userTable of [
      'corp_industry_jobs',
      'corp_industry_job_syncs',
      'maps',
      'user_preferences',
      'custom_structures',
    ]) {
      expect(seq).toContain(userTable);
    }
    expect(seq.indexOf('corp_industry_jobs')).toBeLessThan(seq.indexOf('user_preferences'));
    expect(seq.indexOf('corp_industry_jobs')).toBeLessThan(seq.indexOf('custom_structures'));
    expect(seq.indexOf('maps')).toBeLessThan(seq.indexOf('corp_industry_jobs'));
    expect(seq).not.toContain('account');
    expect(seq).not.toContain('character_skills');
  });
});
