import { describe, expect, it, vi } from 'vitest';
import { type CorpJobsPersistPlan, planCorpJobsPersist, refreshCorpJobsForUser } from './corp-refresh';
import type { IndustryJob } from './esi-projection';
import type { CorpJobsPort, JobsEsiRead, RefreshCorpMember } from './types';

const SCOPE = 'esi-industry.read_corporation_jobs.v1';
const ROLES_SCOPE = 'esi-characters.read_corporation_roles.v1';

function member(overrides: Partial<RefreshCorpMember> = {}): RefreshCorpMember {
  return {
    characterId: 1,
    corporationId: 2000,
    hasRefreshToken: true,
    missingScopes: [],
    ...overrides,
  };
}

function job(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 100,
    runs: 1,
    status: 'active',
    start_date: '2026-06-28T00:00:00Z',
    end_date: '2026-06-28T01:00:00Z',
    ...overrides,
  };
}

interface FakeOptions {
  members: RefreshCorpMember[];
  now?: Date;
  // per-character vended token (null = unavailable)
  tokens?: Record<number, string | null>;
  // per-character roles (null = roles read failed)
  roles?: Record<number, string[] | null>;
  // per-corp ESI read result
  reads?: Record<number, JobsEsiRead>;
  // per-corp pre-existing sync state
  syncStates?: Record<number, { lastRefreshedAt: Date | null; jobsEtag: string | null }>;
}

function makeFakePort(opts: FakeOptions) {
  const calls = {
    vend: [] as number[],
    readRoles: [] as number[],
    readJobs: [] as number[],
    saveJobs: [] as Array<{ corporationId: number; jobs: IndustryJob[]; etag: string | null }>,
    saveNeedsRole: [] as number[],
    stampFresh: [] as number[],
  };
  const port: CorpJobsPort = {
    now: () => opts.now ?? new Date('2026-06-28T12:00:00Z'),
    listMembers: () => Promise.resolve(opts.members),
    vendToken: (characterId) => {
      calls.vend.push(characterId);
      const token =
        opts.tokens && characterId in opts.tokens ? opts.tokens[characterId] : `tok-${characterId}`;
      return Promise.resolve(token ?? null);
    },
    readRoles: (characterId) => {
      calls.readRoles.push(characterId);
      const roles = opts.roles?.[characterId];
      return Promise.resolve(roles === undefined ? ['Factory_Manager'] : roles);
    },
    readJobs: (corporationId) => {
      calls.readJobs.push(corporationId);
      return Promise.resolve(opts.reads?.[corporationId] ?? { kind: 'unchanged' });
    },
    readSyncState: (_userId, corporationId) => {
      const state = opts.syncStates?.[corporationId];
      return Promise.resolve(
        state ? { lastRefreshedAt: state.lastRefreshedAt, jobsEtag: state.jobsEtag, syncError: null } : null,
      );
    },
    saveJobs: (_userId, corporationId, jobs, etag) => {
      calls.saveJobs.push({ corporationId, jobs, etag });
      return Promise.resolve();
    },
    saveNeedsRole: (_userId, corporationId) => {
      calls.saveNeedsRole.push(corporationId);
      return Promise.resolve();
    },
    stampFresh: (_userId, corporationId) => {
      calls.stampFresh.push(corporationId);
      return Promise.resolve();
    },
  };
  return { port, calls };
}

describe('planCorpJobsPersist', () => {
  const cases: Array<[string, JobsEsiRead, CorpJobsPersistPlan]> = [
    ['saves a fresh body', { kind: 'fresh', body: [], etag: 'e1' }, { kind: 'save', jobs: [], etag: 'e1' }],
    ['stamps on a 304', { kind: 'unchanged' }, { kind: 'stamp' }],
    ['needs_role on a 403', { kind: 'error', code: 'esi_403' }, { kind: 'needs_role' }],
    ['skips a transient error', { kind: 'error', code: 'esi_server_error' }, { kind: 'skip' }],
    ['skips budget exhaustion', { kind: 'error', code: 'budget_exhausted' }, { kind: 'skip' }],
  ];
  it.each(cases)('%s', (_label, read, expected) => {
    expect(planCorpJobsPersist(read)).toEqual(expected);
  });

  it('skips a fresh body that fails the contract parse', () => {
    expect(planCorpJobsPersist({ kind: 'fresh', body: { not: 'an array' }, etag: 'e' })).toEqual({
      kind: 'skip',
    });
  });
});

describe('refreshCorpJobsForUser', () => {
  it('does zero work for a fresh corp (the staleness gate is the dedup)', async () => {
    const { port, calls } = makeFakePort({
      members: [member({ characterId: 1, corporationId: 2000 })],
      now: new Date('2026-06-28T12:00:00Z'),
      syncStates: { 2000: { lastRefreshedAt: new Date('2026-06-28T11:59:00Z'), jobsEtag: 'e' } },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.vend).toEqual([]);
    expect(calls.readJobs).toEqual([]);
    expect(calls.saveJobs).toEqual([]);
    expect(calls.stampFresh).toEqual([]);
  });

  it('resolves a director and saves the board for a never-synced corp', async () => {
    const fresh = job({ job_id: 7 });
    const { port, calls } = makeFakePort({
      members: [member({ characterId: 1, corporationId: 2000 })],
      reads: { 2000: { kind: 'fresh', body: [fresh], etag: 'etag-1' } },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.readJobs).toEqual([2000]);
    expect(calls.saveJobs).toEqual([{ corporationId: 2000, jobs: [fresh], etag: 'etag-1' }]);
  });

  it('records needs_role when no member holds the role, without an ESI read', async () => {
    const { port, calls } = makeFakePort({
      members: [
        member({ characterId: 1, corporationId: 2000 }),
        member({ characterId: 2, corporationId: 2000 }),
      ],
      roles: { 1: ['Accountant'], 2: ['Station_Manager'] },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.readJobs).toEqual([]); // no token spent on a guaranteed 403
    expect(calls.saveNeedsRole).toEqual([2000]);
    expect(calls.saveJobs).toEqual([]);
  });

  it('skips (no stamp) when no member can be vended — transient, retry next view', async () => {
    const { port, calls } = makeFakePort({
      members: [member({ characterId: 1, corporationId: 2000 })],
      tokens: { 1: null },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.readJobs).toEqual([]);
    expect(calls.saveNeedsRole).toEqual([]);
    expect(calls.stampFresh).toEqual([]);
    expect(calls.saveJobs).toEqual([]);
  });

  it('stamps freshness on a 304', async () => {
    const { port, calls } = makeFakePort({
      members: [member({ characterId: 1, corporationId: 2000 })],
      syncStates: { 2000: { lastRefreshedAt: null, jobsEtag: 'held' } },
      reads: { 2000: { kind: 'unchanged' } },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.readJobs).toEqual([2000]);
    expect(calls.stampFresh).toEqual([2000]);
    expect(calls.saveJobs).toEqual([]);
  });

  it('maps a read 403 (role revoked mid-run) to needs_role', async () => {
    const { port, calls } = makeFakePort({
      members: [member({ characterId: 1, corporationId: 2000 })],
      reads: { 2000: { kind: 'error', code: 'esi_403' } },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.saveNeedsRole).toEqual([2000]);
    expect(calls.saveJobs).toEqual([]);
  });

  it('prefers a role-holder as the vending character', async () => {
    const { port } = makeFakePort({
      members: [
        member({ characterId: 1, corporationId: 2000 }),
        member({ characterId: 2, corporationId: 2000 }),
      ],
      roles: { 1: ['Accountant'], 2: ['Director'] },
      reads: { 2000: { kind: 'fresh', body: [], etag: 'e' } },
    });
    const readJobs = vi.fn(port.readJobs);
    port.readJobs = (corporationId, accessToken, heldEtag) => {
      // The Director's token (character 2) reads the board.
      expect(accessToken).toBe('tok-2');
      return readJobs(corporationId, accessToken, heldEtag);
    };
    await refreshCorpJobsForUser(port, 'user-1');
    expect(readJobs).toHaveBeenCalledOnce();
  });

  it('skips members missing the corp scopes and corps with no cached id', async () => {
    const { port, calls } = makeFakePort({
      members: [
        member({ characterId: 1, corporationId: 2000, missingScopes: [SCOPE] }),
        member({ characterId: 2, corporationId: null }),
        member({ characterId: 3, corporationId: 3000, missingScopes: [ROLES_SCOPE] }),
      ],
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.vend).toEqual([]); // all three filtered before any work
    expect(calls.readJobs).toEqual([]);
  });

  it('refreshes multiple corps independently', async () => {
    const { port, calls } = makeFakePort({
      members: [
        member({ characterId: 1, corporationId: 2000 }),
        member({ characterId: 2, corporationId: 3000 }),
      ],
      reads: {
        2000: { kind: 'fresh', body: [job({ job_id: 1 })], etag: 'a' },
        3000: { kind: 'fresh', body: [job({ job_id: 2 })], etag: 'b' },
      },
    });
    await refreshCorpJobsForUser(port, 'user-1');
    expect(calls.saveJobs.map((s) => s.corporationId).sort()).toEqual([2000, 3000]);
  });
});
