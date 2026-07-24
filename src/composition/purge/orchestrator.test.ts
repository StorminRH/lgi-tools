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

import { runPurge } from './orchestrator';

const names = (): string[] => recorded.map((r) => getTableConfig(r.table as PgTable).name);

beforeEach(() => {
  recorded.length = 0;
});

describe('runPurge orchestrator', () => {
  it('transfer scope (credential tier only) touches exactly account then characters', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 }, ['credential']);
    expect(names()).toEqual(['account', 'characters']);
  });

  it('full character purge runs credentials before the regenerable caches', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 });
    const seq = names();
    expect(seq[0]).toBe('account');
    expect(seq[1]).toBe('characters');
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
      'user_preferences',
      'custom_structures',
    ]) {
      expect(seq).toContain(userTable);
    }
    expect(seq.indexOf('corp_industry_jobs')).toBeLessThan(seq.indexOf('user_preferences'));
    expect(seq.indexOf('corp_industry_jobs')).toBeLessThan(seq.indexOf('custom_structures'));
    expect(seq).not.toContain('account');
    expect(seq).not.toContain('character_skills');
  });
});
