import { vi } from 'vitest';
import type { OwnedDatasetPort, PagedOwnerReadResult } from '../owned';
import type { EnumeratedOwner, ReadSession } from '../types';

/**
 * A linked character the sync may act for: refresh token held, no missing
 * scopes, no corporation. Pass every field a test reads that differs from these
 * defaults, such as a corp member's corporationId or a missing scope.
 */
export function ownerFixture(characterId: number, extra: Partial<EnumeratedOwner> = {}): EnumeratedOwner {
  return { characterId, corporationId: null, hasRefreshToken: true, missingScopes: [], ...extra };
}

/** A read session that commits nothing: what a port fake opens, and what a test asserts was committed. */
export function readSessionFake<TSession extends ReadSession = ReadSession>(): TSession {
  return { commit: vi.fn(async () => {}) } as unknown as TSession;
}

/**
 * An owned-dataset port with no owners, a 'token' vend, no roles, every
 * owner due, an empty fresh read, no held sync state, and no-op writes.
 * Every method but now() is a vi.fn; override the ones a test drives.
 */
export function ownedDatasetPortFake<TRow, TSession extends ReadSession = ReadSession>(
  now: Date,
  overrides: Partial<OwnedDatasetPort<TRow, TSession>> = {},
): OwnedDatasetPort<TRow, TSession> {
  return {
    now: () => now,
    listCharacters: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    readRoles: vi.fn(async () => []),
    isDue: vi.fn(async () => true),
    openSession: vi.fn(() => readSessionFake<TSession>()),
    read: vi.fn(
      async (): Promise<PagedOwnerReadResult> => ({
        kind: 'fresh',
        items: [],
        etags: [],
        responseHeaders: [],
      }),
    ),
    readSyncState: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    recordRefusal: vi.fn(async () => {}),
    ...overrides,
  };
}
