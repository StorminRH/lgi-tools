import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, recorded, executions } = vi.hoisted(() => {
  const recorded: { op: 'delete' | 'update'; table: unknown }[] = [];
  const executions = { count: 0 };
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
  chain.execute = async () => {
    executions.count += 1;
    return [];
  };
  return { chain, recorded, executions };
});

vi.mock('@/db', () => ({ db: chain }));

vi.mock('@/data/maps/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/maps/queries')>();
  return {
    ...actual,
    getOwnedMapIds: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: vi.fn().mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    outcome: 'applied',
  }),
  teardownMapAccessProjection: vi.fn().mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    outcome: 'applied',
  }),
  purgeUserMapAccessProjection: vi.fn().mockResolvedValue({ deleted: 0 }),
}));

import { runPurge } from './orchestrator';

const names = (): string[] => recorded.map((r) => getTableConfig(r.table as PgTable).name);

beforeEach(() => {
  recorded.length = 0;
  executions.count = 0;
});

describe('runPurge orchestrator', () => {
  it('credential character purge removes account rows and runs the map grant statement', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 }, ['credential']);
    expect(names()).toEqual(['account']);
    expect(executions.count).toBe(1);
  });

  it('full character purge runs credentials before the regenerable caches', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 });
    const seq = names();
    expect(seq[0]).toBe('account');
    expect(seq).not.toContain('characters');
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
