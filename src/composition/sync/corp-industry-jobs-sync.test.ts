import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveUserCorpAccess: vi.fn(),
  listCorpJobSyncStates: vi.fn(),
  getCorpJobsForUser: vi.fn(),
  after: vi.fn(),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/composition/corp-access', () => ({ resolveUserCorpAccess: mocks.resolveUserCorpAccess }));
vi.mock('@/features/industry-jobs/queries', () => ({
  listCorpJobSyncStates: mocks.listCorpJobSyncStates,
  getCorpJobsForUser: mocks.getCorpJobsForUser,
  readCorpJobSyncState: vi.fn(), saveCorpJobs: vi.fn(), saveCorpNeedsRole: vi.fn(), stampCorpJobsFresh: vi.fn(),
}));
vi.mock('@/features/industry-jobs/corp-refresh', () => ({ refreshCorpJobsForUser: vi.fn() }));
vi.mock('@/data/eve-data/queries', () => ({ getTypeNames: vi.fn().mockResolvedValue(new Map()) }));
vi.mock('@/platform/auth/linked-characters', () => ({ listLinkedCharacters: vi.fn() }));
vi.mock('./owner-sync-port', () => ({ listCharactersWithHealth: vi.fn(), readRolesFor: vi.fn(), readSingleEndpoint: vi.fn(), vendTokenFor: vi.fn() }));
vi.mock('./esi-refresh-owner-sync', () => ({ enqueueBudgetDeferral: vi.fn(), targetedOwnerResult: vi.fn() }));

import { getCorpJobsForUserOnView } from './corp-industry-jobs-sync';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCorpJobsForUser.mockResolvedValue(new Map());
});

it('excludes a departed corporation before cached jobs are read, even with historical sync state', async () => {
  mocks.resolveUserCorpAccess.mockResolvedValue({ characterIdsByCorporation: { 3000: [101] } });
  mocks.listCorpJobSyncStates.mockResolvedValue([
    { corporationId: 2000, lastRefreshedAt: new Date(), syncError: null },
    { corporationId: 3000, lastRefreshedAt: null, syncError: null },
  ]);
  await expect(getCorpJobsForUserOnView('u1')).resolves.toEqual({
    corporations: [{ corporationId: 3000, data: null, lastRefreshedAt: null, syncError: null }],
    names: {},
  });
  expect(mocks.getCorpJobsForUser).toHaveBeenCalledWith('u1', [3000]);
  expect(mocks.resolveUserCorpAccess).toHaveBeenCalledOnce();
});
