import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

// Only the branch the real-Postgres twin (owner-transfer.db.test.ts) cannot
// reach lives here: a multi-character prior owner left untouched when the freed
// character is neither their identity email nor their active character. The
// chainable thenable emulates Drizzle's builder (FIFO results, counted writes).
const hooks = vi.hoisted(() => ({
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform/auth/identity-projection-hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/auth/identity-projection-hooks')>();
  return {
    ...actual,
    runAfterCharacterLinkChanged: (...args: unknown[]) =>
      hooks.runAfterCharacterLinkChanged(...args),
  };
});

const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0 },
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['set', 'where', 'select', 'from', 'limit', 'orderBy', 'returning']) {
    chain[method] = () => chain;
  }
  chain.update = () => {
    state.calls.update += 1;
    return chain;
  };
  chain.delete = () => {
    state.calls.delete += 1;
    return chain;
  };
  return { chain, state };
});

vi.mock('@/db', () => ({ db: chain }));

vi.mock('@/data/maps/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/maps/queries')>();
  return {
    ...actual,
    getCharacterCorporationId: vi.fn().mockResolvedValue(null),
    getMapIdsWithCharacterGrant: vi.fn().mockResolvedValue([]),
    getMapIdsWithCorporationGrants: vi.fn().mockResolvedValue([]),
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

import { purgeTransferredCharacter, reconcileCharacterOwner } from './owner-transfer';

const USER = 'eve-user-1';
const CHAR = 90000001;
const OTHER_CHAR = 90000002;

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  hooks.runAfterCharacterLinkChanged.mockReset().mockResolvedValue(undefined);
});

describe('purgeTransferredCharacter', () => {
  it('keeps a multi-character prior owner untouched when the freed char is neither their email nor active', async () => {
    state.results = [
      [{ id: 'acc-1' }], // deleteLinkedCharacter .returning
      undefined, // characters.preferences reset
      undefined, // direct map-grant delete
      [{ accountId: String(OTHER_CHAR) }], // remaining → one survivor
      // identity email + active point at a DIFFERENT surviving character
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await purgeTransferredCharacter(USER, CHAR);
    // Account + direct grant deleted; only the character reset update runs.
    expect(state.calls).toEqual({ delete: 2, update: 1 });
    expect(hooks.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: USER,
      characterId: CHAR,
    });
  });
});

describe('reconcileCharacterOwner', () => {
  it('no-ops missing hash or row, backfills a blank hash, and purges when the stored hash disagrees', async () => {
    await reconcileCharacterOwner(CHAR, null);
    await reconcileCharacterOwner(CHAR, undefined);
    state.results = [[]];
    await reconcileCharacterOwner(CHAR, 'owner-one');
    expect(state.calls).toEqual({ delete: 0, update: 0 });

    state.results = [[{ userId: USER, ownerHash: null }]];
    await reconcileCharacterOwner(CHAR, 'owner-one');
    expect(state.calls.update).toBe(1);

    state.calls.update = 0;
    state.results = [[{ userId: USER, ownerHash: 'owner-one' }]];
    await reconcileCharacterOwner(CHAR, 'owner-one');
    expect(state.calls).toEqual({ delete: 0, update: 0 });

    state.results = [
      [{ userId: USER, ownerHash: 'owner-old' }],
      [{ id: 'acc-1' }],
      undefined,
      undefined,
      [{ accountId: String(OTHER_CHAR) }],
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await reconcileCharacterOwner(CHAR, 'owner-new');
    expect(state.calls).toEqual({ delete: 2, update: 1 });
    expect(hooks.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: USER,
      characterId: CHAR,
    });
  });
});
