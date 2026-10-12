import { vi } from 'vitest';
import type { OwnedDatasetPort, PagedOwnerReadResult } from '../owned';
import type { EnumeratedOwner } from '../types';

/**
 * A linked character the sync may act for: refresh token held, no missing
 * scopes, no corporation. Pass every field a test reads that differs from these
 * defaults, such as a corp member's corporationId or a missing scope.
 */
export function ownerFixture(characterId: number, extra: Partial<EnumeratedOwner> = {}): EnumeratedOwner {
  return { characterId, corporationId: null, hasRefreshToken: true, missingScopes: [], ...extra };
}

/**
 * An owned-dataset port with no owners, a 'token' vend, no roles, an empty
 * fresh read, no held sync state, and no-op writes. Every method but now() is a
 * vi.fn; override the ones a test drives.
 */
export function ownedDatasetPortFake<TRow>(
  now: Date,
  overrides: Partial<OwnedDatasetPort<TRow>> = {},
): OwnedDatasetPort<TRow> {
  return {
    now: () => now,
    listCharacters: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    readRoles: vi.fn(async () => []),
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
    ...overrides,
  };
}
