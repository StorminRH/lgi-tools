import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state, reset } = await vi.hoisted(async () => {
  const { createFakeQueryChain } = await import('@/db/__tests__/support/fake-query-chain');
  return createFakeQueryChain();
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

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

import { revalidateTag } from 'next/cache';
import { runPurge } from './orchestrator';

const names = (): string[] =>
  state.recorded.filter((r) => r.op !== 'select').map((r) => getTableConfig(r.table as PgTable).name);

beforeEach(() => {
  reset();
  vi.mocked(revalidateTag).mockReset();
});

describe('runPurge orchestrator', () => {
  it('credential character purge removes account rows and runs the map grant statement', async () => {
    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 }, ['credential']);
    expect(names()).toEqual(['account']);
    expect(state.calls.execute).toBe(1);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('full character purge expires each cached slice right after its own deletes', async () => {
    const lastDeleteBefore = new Map<string, string | undefined>();
    vi.mocked(revalidateTag).mockImplementation((tag) => {
      lastDeleteBefore.set(tag, names().at(-1));
    });

    await runPurge({ kind: 'character', userId: 'u1', characterId: 42 });

    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ['skills:42', { expire: 0 }],
      ['character-sheet:42', { expire: 0 }],
      ['industry-jobs:42', { expire: 0 }],
      ['owned-assets:character:42', { expire: 0 }],
      ['owned-blueprints:character:42', { expire: 0 }],
    ]);
    expect(Object.fromEntries(lastDeleteBefore)).toEqual({
      'skills:42': 'character_skill_syncs',
      'character-sheet:42': 'character_sheets',
      'industry-jobs:42': 'character_industry_job_syncs',
      'owned-assets:character:42': 'owned_asset_syncs',
      'owned-blueprints:character:42': 'owned_blueprint_syncs',
    });
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
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
