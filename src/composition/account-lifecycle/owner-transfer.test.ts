import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

const hooks = vi.hoisted(() => ({
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
  runBeforeUserDelete: vi.fn().mockResolvedValue(undefined),
  runBeforeCharacterUnlink: vi.fn().mockResolvedValue([]),
  runAfterFailedCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterUnlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/composition/map-access-identity', () => {
  return { identityProjectionRunners: hooks };
});

const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0, execute: 0 },
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['set', 'where', 'select', 'from', 'limit', 'orderBy', 'returning']) {
    chain[method] = () => chain;
  }
  chain.execute = async () => {
    state.calls.execute += 1;
    return [];
  };
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

const merge = vi.hoisted(() => ({
  mergeUsers: vi.fn(),
  settleConvexAfterMerge: vi.fn(),
  after: vi.fn(),
  decryptToken: vi.fn((value: string) => value.replace(/^enc:/, '')),
}));

vi.mock('@/db', () => ({ db: chain }));
vi.mock('next/server', () => ({ after: merge.after }));
vi.mock('./account-merge', () => ({
  mergeUsers: merge.mergeUsers,
  settleConvexAfterMerge: merge.settleConvexAfterMerge,
}));
vi.mock('@/platform/auth/token-crypto', () => ({ decryptToken: merge.decryptToken }));

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

import { proveCharacter, purgeTransferredCharacter } from './owner-transfer';

const USER = 'eve-user-1';
const LINKER = 'eve-user-2';
const CHAR = 90000001;
const OTHER_CHAR = 90000002;
const H1 = 'owner-one';
const H2 = 'owner-two';

const tokenWithOwner = (owner: string): string =>
  `enc:h.${Buffer.from(JSON.stringify({ owner })).toString('base64url')}.s`;

const row = (over: Partial<{ userId: string; ownerHash: string | null; accessToken: string | null }> = {}) => [
  { id: 'acc-1', userId: USER, ownerHash: H1, accessToken: null, ...over },
];

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  state.calls.execute = 0;
  hooks.runAfterCharacterLinkChanged.mockReset().mockResolvedValue(undefined);
  hooks.runBeforeCharacterUnlink.mockReset().mockResolvedValue(['map-pre-removal']);
  merge.mergeUsers.mockReset();
  merge.after.mockReset();
  merge.settleConvexAfterMerge.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('purgeTransferredCharacter', () => {
  it('keeps the prior link when revocation cannot be confirmed', async () => {
    const failure = new Error('Convex unavailable');
    hooks.runBeforeCharacterUnlink.mockRejectedValueOnce(failure);
    await expect(purgeTransferredCharacter(USER, CHAR)).rejects.toBe(failure);
    expect(state.calls).toEqual({ delete: 0, update: 0, execute: 0 });
  });

  it('completes source reconciliation and final teardown before reporting a history-erasure failure', async () => {
    state.results = [
      [{ id: 'acc-1' }],
      [{ accountId: String(OTHER_CHAR) }],
      [{ email: syntheticEmail(CHAR), activeCharacterId: OTHER_CHAR }],
      undefined,
    ];
    const failure = new Error('history deletion failed');
    hooks.runAfterCharacterUnlink.mockRejectedValueOnce(failure);
    await expect(purgeTransferredCharacter(USER, CHAR)).rejects.toBe(failure);
    expect(state.calls.update).toBe(1);
    expect(hooks.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: USER, characterId: CHAR });
  });

  it('keeps a multi-character prior owner untouched when the freed char is neither their email nor active', async () => {
    state.results = [
      [{ id: 'acc-1' }],
      [{ accountId: String(OTHER_CHAR) }],
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await purgeTransferredCharacter(USER, CHAR);
    expect(hooks.runBeforeCharacterUnlink).toHaveBeenCalledWith({ userId: USER, characterId: CHAR });
    expect(hooks.runAfterCharacterUnlink).toHaveBeenCalledWith({
      userId: USER, characterId: CHAR, mapIds: ['map-pre-removal'],
    });
    expect(state.calls).toEqual({ delete: 1, update: 0, execute: 1 });
    expect(hooks.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: USER,
      characterId: CHAR,
    });
  });
});

describe('proveCharacter on sign-in and same-user relink', () => {
  it('no-ops a missing owner claim or row, backfills a blank hash, and purges when the stored hash disagrees', async () => {
    await expect(proveCharacter({ characterId: CHAR, ownerHash: null, linkingUserId: null })).resolves.toEqual({ kind: 'none' });
    state.results = [[]];
    await expect(proveCharacter({ characterId: CHAR, ownerHash: H1, linkingUserId: null })).resolves.toEqual({ kind: 'none' });
    expect(state.calls).toEqual({ delete: 0, update: 0, execute: 0 });

    state.results = [row({ ownerHash: null }), [{ id: 'acc-1' }]];
    await proveCharacter({ characterId: CHAR, ownerHash: H1, linkingUserId: null });
    expect(state.calls.update).toBe(1);

    state.calls.update = 0;
    state.results = [row()];
    await proveCharacter({ characterId: CHAR, ownerHash: H1, linkingUserId: USER });
    expect(state.calls).toEqual({ delete: 0, update: 0, execute: 0 });

    state.results = [
      row({ ownerHash: 'owner-old' }),
      [{ id: 'acc-1' }],
      [{ accountId: String(OTHER_CHAR) }],
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await expect(proveCharacter({ characterId: CHAR, ownerHash: H1, linkingUserId: null })).resolves.toEqual({ kind: 'none' });
    expect(state.calls).toEqual({ delete: 1, update: 0, execute: 1 });
    expect(hooks.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: USER, characterId: CHAR });
    expect(merge.mergeUsers).not.toHaveBeenCalled();
  });
});

describe('proveCharacter on a cross-user link', () => {
  const linkProof = { characterId: CHAR, ownerHash: H1, linkingUserId: LINKER };

  it('merges when the stored hash matches, schedules the Convex settlement after the response, and reports the survivor', async () => {
    state.results = [row()];
    merge.mergeUsers.mockResolvedValue({
      kind: 'merged',
      survivorUserId: USER,
      sourceUserId: LINKER,
      movedCharacterIds: [OTHER_CHAR],
      captured: [{ mapId: 'map-1', version: 'v1' }],
    });
    await expect(proveCharacter(linkProof)).resolves.toEqual({
      kind: 'merged',
      survivorUserId: USER,
      sourceUserId: LINKER,
    });
    expect(merge.mergeUsers).toHaveBeenCalledWith({
      linkingUserId: LINKER,
      otherUserId: USER,
      provenCharacterId: CHAR,
      jwtOwnerHash: H1,
    });
    expect(state.calls.update).toBe(0);
    const scheduled = merge.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(merge.settleConvexAfterMerge).not.toHaveBeenCalled();
    await scheduled?.();
    expect(merge.settleConvexAfterMerge).toHaveBeenCalledWith(
      expect.objectContaining({ survivorUserId: USER, sourceUserId: LINKER, movedCharacterIds: [OTHER_CHAR] }),
    );
  });

  it('degrades to the standard link flow when the merge throws or converges without changes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.results = [row()];
    merge.mergeUsers.mockRejectedValueOnce(new Error('direct endpoint unavailable'));
    await expect(proveCharacter(linkProof)).resolves.toEqual({ kind: 'none' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[auth] account merge failed before commit; standard link flow continues',
      expect.any(Error),
    );

    state.results = [row()];
    merge.mergeUsers.mockResolvedValueOnce({ kind: 'noop', reason: 'source-gone' });
    await expect(proveCharacter(linkProof)).resolves.toEqual({ kind: 'none' });
    expect(warnSpy).toHaveBeenCalledWith('[auth] account merge converged without changes', 'source-gone');
    expect(merge.after).not.toHaveBeenCalled();
  });

  it('derives a null column from the stored token: a match backfills then merges, a mismatch purges', async () => {
    state.results = [row({ ownerHash: null, accessToken: tokenWithOwner(H1) }), [{ id: 'acc-1' }]];
    merge.mergeUsers.mockResolvedValue({ kind: 'noop', reason: 'same-user' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await proveCharacter(linkProof);
    expect(state.calls.update).toBe(1);
    expect(merge.mergeUsers).toHaveBeenCalledWith(expect.objectContaining({ otherUserId: USER }));

    state.calls.update = 0;
    merge.mergeUsers.mockClear();
    state.results = [
      row({ ownerHash: null, accessToken: tokenWithOwner(H2) }),
      [{ id: 'acc-1' }],
      [{ accountId: String(OTHER_CHAR) }],
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await expect(proveCharacter(linkProof)).resolves.toEqual({ kind: 'none' });
    expect(state.calls).toEqual({ delete: 1, update: 0, execute: 1 });
    expect(merge.mergeUsers).not.toHaveBeenCalled();
  });

  it('neither merges nor purges when nothing on the row proves ownership', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.results = [row({ ownerHash: null, accessToken: null })];
    await expect(proveCharacter(linkProof)).resolves.toEqual({ kind: 'none' });
    state.results = [row({ ownerHash: null, accessToken: 'enc:not-a-jwt' })];
    await expect(proveCharacter(linkProof)).resolves.toEqual({ kind: 'none' });
    expect(state.calls).toEqual({ delete: 0, update: 0, execute: 0 });
    expect(merge.mergeUsers).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
