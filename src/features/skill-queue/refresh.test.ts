import { describe, expect, it, vi } from 'vitest';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { SingleOwnerRead } from '@/platform/owner-sync';
import { ownerFixture, readSessionFake } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { planSkillsPersist, refreshSkillsForUser } from './refresh';
import type { SkillsPort } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const QUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';

function esiQueueEntry(skillId: number, position: number) {
  return {
    skill_id: skillId,
    queue_position: position,
    finished_level: 5,
    start_date: '2026-06-28T00:00:00Z',
    finish_date: '2026-06-29T00:00:00Z',
  };
}

function makePort(overrides: Partial<SkillsPort> = {}): SkillsPort {
  return {
    now: () => NOW,
    listCharacters: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    isDue: vi.fn(async () => true),
    openSession: () => readSessionFake<EsiReadSession>(),
    readSkillQueue: vi.fn(
      async (): Promise<SingleOwnerRead> => ({ kind: 'fresh', body: [esiQueueEntry(34, 0)], etag: '"q"' }),
    ),
    readSkills: vi.fn(
      async (): Promise<SingleOwnerRead> => ({
        kind: 'fresh',
        body: { total_sp: 1_000, skills: [{ skill_id: 3380, active_skill_level: 5 }] },
        etag: '"s"',
      }),
    ),
    readSyncState: vi.fn(async () => null),
    saveSkills: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    recordRefusal: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('refreshSkillsForUser', () => {
  it('makes no token vend and no ESI call while the stored answers are unexpired (the store is the gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      isDue: vi.fn(async () => false),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readSkillQueue).not.toHaveBeenCalled();
    expect(port.readSkills).not.toHaveBeenCalled();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });

  it('fetches and saves both halves for a never-synced character', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSkillQueue).toHaveBeenCalledWith(expect.anything(), 1, 'token');
    expect(port.readSkills).toHaveBeenCalledWith(expect.anything(), 1, 'token');
    const save = vi.mocked(port.saveSkills).mock.calls[0]!;
    expect(save[0]).toBe(1);
    expect(save[1]).toEqual({
      queue: { entries: [esiQueueEntry(34, 0)], etag: '"q"' },
      skills: { totalSp: 1_000, levels: { '3380': 5 }, etag: '"s"' },
    });
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('carries unallocated SP onto the saved skills half when present', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSkills: vi.fn(
        async (): Promise<SingleOwnerRead> => ({
          kind: 'fresh',
          body: { total_sp: 2_000, unallocated_sp: 50, skills: [] },
          etag: '"s"',
        }),
      ),
    });

    await refreshSkillsForUser(port, 'u1');

    const save = vi.mocked(port.saveSkills).mock.calls[0]!;
    expect(save[1].skills).toEqual({ totalSp: 2_000, unallocatedSp: 50, levels: {}, etag: '"s"' });
  });

  it('only stamps freshness when BOTH halves come back unchanged', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null })),
      readSkillQueue: vi.fn(async (): Promise<SingleOwnerRead> => ({ kind: 'unchanged' })),
      readSkills: vi.fn(async (): Promise<SingleOwnerRead> => ({ kind: 'unchanged' })),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });

  it('persists ONLY the fresh half on a partial 304 (queue changed, totals unchanged)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null })),
      readSkillQueue: vi.fn(
        async (): Promise<SingleOwnerRead> => ({ kind: 'fresh', body: [esiQueueEntry(99, 0)], etag: '"q2"' }),
      ),
      readSkills: vi.fn(async (): Promise<SingleOwnerRead> => ({ kind: 'unchanged' })),
    });

    await refreshSkillsForUser(port, 'u1');

    const save = vi.mocked(port.saveSkills).mock.calls[0]!;
    expect(save[1]).toEqual({ queue: { entries: [esiQueueEntry(99, 0)], etag: '"q2"' } });
    expect(save[1].skills).toBeUndefined();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('skips the character on an ESI error without saving or stamping', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSkillQueue: vi.fn(
        async (): Promise<SingleOwnerRead> => ({ kind: 'error', code: 'esi_500' }),
      ),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.saveSkills).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('refreshes several stale characters in one parallel pass', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1), ownerFixture(2), ownerFixture(3)]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshSkillsForUser(port, 'u1');

    const saved = vi
      .mocked(port.saveSkills)
      .mock.calls.map(([characterId]) => characterId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing a skill scope (no due check, no sync-state read, no vend)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { missingScopes: [QUEUE_SCOPE] })]),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.isDue).not.toHaveBeenCalled();
    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be vended', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      vendToken: vi.fn(async () => ({ missing: 'lost' as const })),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSkillQueue).not.toHaveBeenCalled();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });
});

describe('planSkillsPersist', () => {
  const fresh = (body: unknown, etag: string | null): SingleOwnerRead => ({ kind: 'fresh', body, etag });
  const unchanged: SingleOwnerRead = { kind: 'unchanged' };

  it('skips on a contract mismatch in a fresh body', () => {
    expect(planSkillsPersist(fresh({ not: 'an array' }, '"q"'), unchanged)).toEqual({ kind: 'skip', code: 'contract_error' });
    expect(planSkillsPersist(unchanged, fresh({ wrong: 'shape' }, '"s"'))).toEqual({ kind: 'skip', code: 'contract_error' });
  });
});
