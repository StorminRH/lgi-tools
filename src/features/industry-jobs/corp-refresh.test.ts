import { expect, test, vi } from 'vitest';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { EnumeratedOwner, SingleOwnerRead } from '@/platform/owner-sync';
import { NO_STATEMENTS, ownerFixture, readSessionFake } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { industryJob } from './__tests__/job-fixture';
import { refreshCorpJobsForUser } from './corp-refresh';
import type { IndustryJob } from './esi-projection';
import type { CorpJobsPort } from './types';

const SCOPE = 'esi-industry.read_corporation_jobs.v1';
const ROLES_SCOPE = 'esi-characters.read_corporation_roles.v1';

interface FakeOptions {
  members: EnumeratedOwner[];
  now?: Date;
  tokens?: Record<number, string | null>;
  roles?: Record<number, string[] | null>;
  /** One read per corporation, or one per token when a corp answers members differently. */
  reads?: Record<number, SingleOwnerRead | ((accessToken: string) => SingleOwnerRead)>;
  due?: Record<number, boolean>;
  syncStates?: Record<number, { lastRefreshedAt: Date | null }>;
}

function makeFakePort(opts: FakeOptions) {
  const calls = {
    vend: [] as number[],
    readRoles: [] as number[],
    readJobs: [] as number[],
    saveJobs: [] as Array<{ corporationId: number; jobs: IndustryJob[]; etag: string | null }>,
    saveNeedsRole: [] as number[],
    stampFresh: [] as number[],
    recordRefusal: [] as Array<{ corporationId: number; expiresAt: number | null }>,
  };
  const port: CorpJobsPort = {
    now: () => opts.now ?? new Date('2026-06-28T12:00:00Z'),
    listMembers: () => Promise.resolve(opts.members),
    vendToken: (characterId) => {
      calls.vend.push(characterId);
      const token =
        opts.tokens && characterId in opts.tokens ? opts.tokens[characterId] : `tok-${characterId}`;
      return Promise.resolve(token ?? { missing: 'unavailable' as const });
    },
    readRoles: (characterId) => {
      calls.readRoles.push(characterId);
      const roles = opts.roles?.[characterId];
      return Promise.resolve(roles === undefined ? ['Factory_Manager'] : roles);
    },
    isDue: (_userId, corporationId) => Promise.resolve(opts.due?.[corporationId] ?? true),
    openSession: () => readSessionFake<EsiReadSession>(),
    readJobs: (_session, _userId, corporationId, accessToken) => {
      calls.readJobs.push(corporationId);
      const read = opts.reads?.[corporationId];
      return Promise.resolve(typeof read === 'function' ? read(accessToken) : read ?? { kind: 'unchanged' });
    },
    readSyncState: (_userId, corporationId) => {
      const state = opts.syncStates?.[corporationId];
      return Promise.resolve(state ? { lastRefreshedAt: state.lastRefreshedAt, syncError: null } : null);
    },
    saveJobs: (_userId, corporationId, jobs, etag) => {
      calls.saveJobs.push({ corporationId, jobs, etag });
      return NO_STATEMENTS;
    },
    saveNeedsRole: (_userId, corporationId) => {
      calls.saveNeedsRole.push(corporationId);
      return Promise.resolve();
    },
    stampFresh: (_userId, corporationId) => {
      calls.stampFresh.push(corporationId);
      return Promise.resolve();
    },
    recordRefusal: (_userId, corporationId, expiresAt) => {
      calls.recordRefusal.push({ corporationId, expiresAt });
      return Promise.resolve();
    },
  };
  return { port, calls };
}

const CORP = { ownerType: 'corporation', ownerId: 2000 } as const;

test('a due corp saves its board on a fresh read and stamps freshness on a 304, while an unexpired one does no work', async () => {
  const fresh = industryJob({ job_id: 7 });
  const neverSynced = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    reads: { 2000: { kind: 'fresh', body: [fresh], etag: 'etag-1' } },
  });
  expect(await refreshCorpJobsForUser(neverSynced.port, 'user-1')).toEqual([{ kind: 'succeeded', target: CORP }]);
  expect(neverSynced.calls.readJobs).toEqual([2000]);
  expect(neverSynced.calls.saveJobs).toEqual([{ corporationId: 2000, jobs: [fresh], etag: 'etag-1' }]);

  const unchanged = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    syncStates: { 2000: { lastRefreshedAt: null } },
    reads: { 2000: { kind: 'unchanged' } },
  });
  expect(await refreshCorpJobsForUser(unchanged.port, 'user-1')).toEqual([{ kind: 'succeeded', target: CORP }]);
  expect(unchanged.calls.readJobs).toEqual([2000]);
  expect(unchanged.calls.stampFresh).toEqual([2000]);
  expect(unchanged.calls.saveJobs).toEqual([]);

  // The stored answer is the dedup: an unexpired one vends, reads and writes nothing.
  const unexpired = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    now: new Date('2026-06-28T12:00:00Z'),
    due: { 2000: false },
  });
  await refreshCorpJobsForUser(unexpired.port, 'user-1');
  expect(unexpired.calls.vend).toEqual([]);
  expect(unexpired.calls.readJobs).toEqual([]);
  expect(unexpired.calls.saveJobs).toEqual([]);
  expect(unexpired.calls.stampFresh).toEqual([]);
});

test('needs_role is recorded when no member holds the role, without a read, and when a read 403s mid-run', async () => {
  const noRole = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 2000 })],
    roles: { 1: ['Accountant'], 2: ['Station_Manager'] },
  });
  expect(await refreshCorpJobsForUser(noRole.port, 'user-1')).toEqual([
    { kind: 'failed_permanent', target: CORP, code: 'needs_role' },
  ]);
  expect(noRole.calls.readJobs).toEqual([]);
  expect(noRole.calls.saveNeedsRole).toEqual([2000]);
  expect(noRole.calls.saveJobs).toEqual([]);
  expect(noRole.calls.recordRefusal).toEqual([{ corporationId: 2000, expiresAt: null }]);

  const revoked = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    reads: { 2000: { kind: 'error', code: 'esi_403', expiresAt: 8_000 } },
  });
  expect(await refreshCorpJobsForUser(revoked.port, 'user-1')).toEqual([
    { kind: 'failed_permanent', target: CORP, code: 'needs_role' },
  ]);
  expect(revoked.calls.saveNeedsRole).toEqual([2000]);
  expect(revoked.calls.saveJobs).toEqual([]);
  expect(revoked.calls.recordRefusal).toEqual([{ corporationId: 2000, expiresAt: 8_000 }]);
});

test('skips (no stamp) when no member can be vended — transient, retry next view', async () => {
  const { port, calls } = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    tokens: { 1: null },
  });
  await refreshCorpJobsForUser(port, 'user-1');
  expect(calls.readJobs).toEqual([]);
  expect(calls.saveNeedsRole).toEqual([]);
  expect(calls.stampFresh).toEqual([]);
  expect(calls.saveJobs).toEqual([]);
  expect(calls.recordRefusal).toEqual([]);
});

test('falls back to the next role-holder when ESI refuses the first, recording needs_role only when nobody is left', async () => {
  const fresh = industryJob({ job_id: 9 });
  const refusedFirst = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 2000 })],
    reads: { 2000: (accessToken) => (accessToken === 'tok-1' ? { kind: 'error', code: 'esi_403' } : { kind: 'fresh', body: [fresh], etag: 'e2' }) },
  });
  expect(await refreshCorpJobsForUser(refusedFirst.port, 'user-1')).toEqual([{ kind: 'succeeded', target: CORP }]);
  expect(refusedFirst.calls.vend).toEqual([1, 2]);
  expect(refusedFirst.calls.readJobs).toEqual([2000, 2000]);
  expect(refusedFirst.calls.saveJobs).toEqual([{ corporationId: 2000, jobs: [fresh], etag: 'e2' }]);
  expect(refusedFirst.calls.saveNeedsRole).toEqual([]);

  const refusedAll = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 2000 })],
    reads: { 2000: { kind: 'error', code: 'esi_403' } },
  });
  expect((await refreshCorpJobsForUser(refusedAll.port, 'user-1'))[0]).toMatchObject({ code: 'needs_role' });
  expect(refusedAll.calls.readJobs).toEqual([2000, 2000]);
  expect(refusedAll.calls.saveNeedsRole).toEqual([2000]);
});

test("keeps the saved jobs and records no refusal when ESI refused the first member and the next one's token or roles are unavailable for now", async () => {
  for (const unavailable of [{ tokens: { 2: null } }, { roles: { 2: null } }]) {
    const { port, calls } = makeFakePort({
      members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 2000 })],
      reads: { 2000: { kind: 'error', code: 'esi_403', expiresAt: 8_000 } },
      ...unavailable,
    });
    expect(await refreshCorpJobsForUser(port, 'user-1')).toEqual([
      { kind: 'failed_retryable', target: CORP, code: 'owner_temporarily_unavailable' },
    ]);
    expect(calls.readJobs).toEqual([2000]);
    expect(calls.saveNeedsRole).toEqual([]);
    expect(calls.recordRefusal).toEqual([]);
    expect(calls.saveJobs).toEqual([]);
    expect(calls.stampFresh).toEqual([]);
  }
});

test('a transient read error and a fresh contract rejection are reported without saving or stamping', async () => {
  const transient = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    reads: { 2000: { kind: 'error', code: 'esi_server_error' } },
  });
  expect(await refreshCorpJobsForUser(transient.port, 'user-1')).toEqual([
    { kind: 'failed_retryable', target: CORP, code: 'esi_server_error' },
  ]);
  expect(transient.calls.saveNeedsRole).toEqual([]);
  expect(transient.calls.stampFresh).toEqual([]);
  expect(transient.calls.saveJobs).toEqual([]);

  const rejected = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 })],
    reads: { 2000: { kind: 'fresh', body: { not: 'an array' }, etag: 'bad' } },
  });
  expect(await refreshCorpJobsForUser(rejected.port, 'user-1')).toEqual([
    { kind: 'failed_permanent', target: CORP, code: 'contract_error' },
  ]);
  expect(rejected.calls.saveNeedsRole).toEqual([]);
  expect(rejected.calls.stampFresh).toEqual([]);
  expect(rejected.calls.saveJobs).toEqual([]);
});

test('prefers a role-holder as the vending character', async () => {
  const { port } = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 2000 })],
    roles: { 1: ['Accountant'], 2: ['Director'] },
    reads: { 2000: { kind: 'fresh', body: [], etag: 'e' } },
  });
  const readJobs = vi.fn(port.readJobs);
  port.readJobs = (session, userId, corporationId, accessToken) => {
    expect(accessToken).toBe('tok-2');
    return readJobs(session, userId, corporationId, accessToken);
  };
  await refreshCorpJobsForUser(port, 'user-1');
  expect(readJobs).toHaveBeenCalledOnce();
});

test('skips members missing the corp scopes and corps with no cached id', async () => {
  const { port, calls } = makeFakePort({
    members: [
      ownerFixture(1, { corporationId: 2000, missingScopes: [SCOPE] }),
      ownerFixture(2, { corporationId: null }),
      ownerFixture(3, { corporationId: 3000, missingScopes: [ROLES_SCOPE] }),
    ],
  });
  await refreshCorpJobsForUser(port, 'user-1');
  expect(calls.vend).toEqual([]);
  expect(calls.readJobs).toEqual([]);
});

test('refreshes multiple corps independently', async () => {
  const { port, calls } = makeFakePort({
    members: [ownerFixture(1, { corporationId: 2000 }), ownerFixture(2, { corporationId: 3000 })],
    reads: {
      2000: { kind: 'fresh', body: [industryJob({ job_id: 1 })], etag: 'a' },
      3000: { kind: 'fresh', body: [industryJob({ job_id: 2 })], etag: 'b' },
    },
  });
  await refreshCorpJobsForUser(port, 'user-1');
  expect(calls.saveJobs.map((s) => s.corporationId).sort()).toEqual([2000, 3000]);
});
