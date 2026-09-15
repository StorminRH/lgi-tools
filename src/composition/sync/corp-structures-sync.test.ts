import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserCorpAccess } from '@/platform/auth/corp-access';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  connection: vi.fn(),
  resolveUserCorpAccess: vi.fn(),
  getCorpStructures: vi.fn(),
  listCorpStructureSyncStates: vi.fn(),
  readCorpStructureSharings: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
  connection: mocks.connection,
}));

vi.mock('@/platform/auth/corp-access', () => ({
  resolveUserCorpAccess: mocks.resolveUserCorpAccess,
  memberCharacterIdsForCorp: vi.fn(),
  authorizeCorpMutation: vi.fn(),
}));

vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructureRigs: vi.fn(),
  getCorpStructures: mocks.getCorpStructures,
  isCorpStructureSharingEnabled: vi.fn(),
  listCorpStructureSyncStates: mocks.listCorpStructureSyncStates,
  readCorpStructureSharings: mocks.readCorpStructureSharings,
  readCorpStructureSyncState: vi.fn(),
  saveCorpStructures: vi.fn(),
  stampCorpStructuresFresh: vi.fn(),
}));

vi.mock('@/features/owned-structures/refresh', () => ({
  refreshCorpStructuresForUser: vi.fn(),
}));

vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: vi.fn(),
}));

vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: vi.fn(),
  readPagedEndpoint: vi.fn(),
  readRolesFor: vi.fn(),
  vendTokenFor: vi.fn(),
}));

import {
  getCorpStructuresForUserOnView,
  getCorpStructuresPageData,
} from './corp-structures-sync';

function accessFor(overrides: Partial<UserCorpAccess> = {}): UserCorpAccess {
  return {
    userId: 'user-1',
    resolvedAt: new Date(),
    transientFailure: false,
    memberCorpIds: [],
    memberCharacterIdsByCorp: new Map(),
    allCharacterIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.resolveUserCorpAccess.mockResolvedValue(accessFor());
  mocks.getCorpStructures.mockResolvedValue(new Map());
  mocks.listCorpStructureSyncStates.mockResolvedValue([]);
  mocks.readCorpStructureSharings.mockResolvedValue(new Map());
});

describe('corp structure affiliation refresh', () => {
  it('waits for a real request before affiliation ESI on both read seams', async () => {
    await expect(getCorpStructuresPageData('user-1')).resolves.toEqual([]);
    await expect(getCorpStructuresForUserOnView('user-1')).resolves.toEqual({
      corporations: [],
    });

    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(mocks.resolveUserCorpAccess).toHaveBeenCalledTimes(2);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolveUserCorpAccess.mock.invocationCallOrder[0]!,
    );
    expect(mocks.connection.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.resolveUserCorpAccess.mock.invocationCallOrder[1]!,
    );
  });
});
