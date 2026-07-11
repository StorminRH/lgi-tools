import { describe, expect, it, vi } from 'vitest';
import { planSkillsPersist, refreshSkillsForUser } from './refresh';
import type { CharacterSkillSyncState, RefreshCharacter, SkillsEsiRead, SkillsPort } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const QUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';

// A valid ESI skillqueue element.
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
    readSkillQueue: vi.fn(
      async (): Promise<SkillsEsiRead> => ({ kind: 'fresh', body: [esiQueueEntry(34, 0)], etag: '"q"' }),
    ),
    readSkills: vi.fn(
      async (): Promise<SkillsEsiRead> => ({
        kind: 'fresh',
        body: { total_sp: 1_000, skills: [{ skill_id: 3380, active_skill_level: 5 }] },
        etag: '"s"',
      }),
    ),
    readSyncState: vi.fn(async () => null),
    saveSkills: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const character = (id: number, extra: Partial<RefreshCharacter> = {}): RefreshCharacter => ({
  characterId: id,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

// lastRefreshedAt 60s ago — inside the 120s TTL, so the character is fresh.
const fresh = (): CharacterSkillSyncState => ({
  lastRefreshedAt: new Date(NOW.getTime() - 60_000),
  queueEtag: null,
  skillsEtag: null,
});

describe('refreshSkillsForUser', () => {
  it('makes no token vend and no ESI call when the character is fresh (the staleness gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => fresh()),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readSkillQueue).not.toHaveBeenCalled();
    expect(port.readSkills).not.toHaveBeenCalled();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });

  it('fetches and saves both halves for a never-synced character', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => null), // never synced → stale, no held etags
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSkillQueue).toHaveBeenCalledWith(1, 'token', null);
    expect(port.readSkills).toHaveBeenCalledWith(1, 'token', null);
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
      listCharacters: vi.fn(async () => [character(1)]),
      readSkills: vi.fn(
        async (): Promise<SkillsEsiRead> => ({
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

  it('replays held etags and only stamps freshness when BOTH halves 304', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => ({
        lastRefreshedAt: null,
        queueEtag: '"qh"',
        skillsEtag: '"sh"',
      })),
      readSkillQueue: vi.fn(async (): Promise<SkillsEsiRead> => ({ kind: 'unchanged' })),
      readSkills: vi.fn(async (): Promise<SkillsEsiRead> => ({ kind: 'unchanged' })),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSkillQueue).toHaveBeenCalledWith(1, 'token', '"qh"');
    expect(port.readSkills).toHaveBeenCalledWith(1, 'token', '"sh"');
    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });

  it('persists ONLY the fresh half on a partial 304 (queue changed, totals unchanged)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null, queueEtag: '"qh"', skillsEtag: '"sh"' })),
      readSkillQueue: vi.fn(
        async (): Promise<SkillsEsiRead> => ({ kind: 'fresh', body: [esiQueueEntry(99, 0)], etag: '"q2"' }),
      ),
      readSkills: vi.fn(async (): Promise<SkillsEsiRead> => ({ kind: 'unchanged' })),
    });

    await refreshSkillsForUser(port, 'u1');

    const save = vi.mocked(port.saveSkills).mock.calls[0]!;
    expect(save[1]).toEqual({ queue: { entries: [esiQueueEntry(99, 0)], etag: '"q2"' } });
    expect(save[1].skills).toBeUndefined();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('skips the character on an ESI error without saving or stamping', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSkillQueue: vi.fn(
        async (): Promise<SkillsEsiRead> => ({ kind: 'error', code: 'esi_500' }),
      ),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.saveSkills).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('refreshes several stale characters in one parallel pass', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1), character(2), character(3)]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshSkillsForUser(port, 'u1');

    const saved = vi
      .mocked(port.saveSkills)
      .mock.calls.map(([characterId]) => characterId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing a skill scope (no sync-state read, no vend)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1, { missingScopes: [QUEUE_SCOPE] })]),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be vended', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      vendToken: vi.fn(async () => null),
    });

    await refreshSkillsForUser(port, 'u1');

    expect(port.readSkillQueue).not.toHaveBeenCalled();
    expect(port.saveSkills).not.toHaveBeenCalled();
  });
});

describe('planSkillsPersist', () => {
  const fresh = (body: unknown, etag: string | null): SkillsEsiRead => ({ kind: 'fresh', body, etag });
  const unchanged: SkillsEsiRead = { kind: 'unchanged' };
  const error: SkillsEsiRead = { kind: 'error', code: 'esi_500' };

  it('saves both halves when both reads are fresh, levels riding the skills half', () => {
    const plan = planSkillsPersist(
      fresh([esiQueueEntry(34, 0)], '"q"'),
      fresh({ total_sp: 10, skills: [{ skill_id: 45746, active_skill_level: 3 }] }, '"s"'),
    );
    expect(plan).toEqual({
      kind: 'save',
      halves: {
        queue: { entries: [esiQueueEntry(34, 0)], etag: '"q"' },
        skills: { totalSp: 10, levels: { '45746': 3 }, etag: '"s"' },
      },
    });
  });

  it('stamps when both halves are 304', () => {
    expect(planSkillsPersist(unchanged, unchanged)).toEqual({ kind: 'stamp' });
  });

  it('saves only the fresh half on a partial 304', () => {
    const plan = planSkillsPersist(fresh([esiQueueEntry(7, 0)], '"q"'), unchanged);
    expect(plan).toEqual({ kind: 'save', halves: { queue: { entries: [esiQueueEntry(7, 0)], etag: '"q"' } } });
  });

  it('skips on an ESI error on either half', () => {
    expect(planSkillsPersist(error, fresh({ total_sp: 1 }, '"s"'))).toEqual({ kind: 'skip' });
    expect(planSkillsPersist(fresh([], '"q"'), error)).toEqual({ kind: 'skip' });
  });

  it('skips on a contract mismatch in a fresh body', () => {
    expect(planSkillsPersist(fresh({ not: 'an array' }, '"q"'), unchanged)).toEqual({ kind: 'skip' });
    expect(planSkillsPersist(unchanged, fresh({ wrong: 'shape' }, '"s"'))).toEqual({ kind: 'skip' });
  });
});
