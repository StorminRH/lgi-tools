import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticEmail } from './synthetic-email';

// Chainable thenable (the queries.owner.test.ts house pattern) for the reconcile
// tail. runPurge + the EVE revoke are mocked so these exercise
// purgeOwnCharacter/nukeAccount's OWN orchestration (revoke → sweep → reconcile),
// not each contributor's internals (covered in-slice).
const { chain, state } = vi.hoisted(() => {
  const state = { results: [] as unknown[], calls: { delete: 0, update: 0 } };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const m of ['set', 'where', 'select', 'from', 'limit', 'orderBy', 'returning', 'values']) {
    chain[m] = () => chain;
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

const runPurgeMock = vi.fn();
vi.mock('@/purge/orchestrator', () => ({
  runPurge: (...args: unknown[]) => runPurgeMock(...args),
}));

const revokeMock = vi.fn();
vi.mock('./eve-token-service', () => ({
  revokeCharacterToken: (id: number) => revokeMock(id),
}));

import { nukeAccount, purgeOwnCharacter } from './account-purge';

const USER = 'eve-user-1';
const CHAR = 90000001;
const OTHER = 90000002;

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  runPurgeMock.mockReset();
  runPurgeMock.mockResolvedValue(undefined);
  revokeMock.mockReset();
  revokeMock.mockResolvedValue(undefined);
});

describe('purgeOwnCharacter', () => {
  it('runs the FULL sweep (all tiers) and revokes the EVE grant', async () => {
    state.results = [
      [{ accountId: String(OTHER) }], // remaining accounts → a survivor
      [{ email: syntheticEmail(OTHER), activeCharacterId: OTHER }], // identity unaffected
    ];
    await purgeOwnCharacter(USER, CHAR);
    expect(revokeMock).toHaveBeenCalledWith(CHAR);
    // Full sweep: the character subject with NO tier narrowing (default = all tiers).
    expect(runPurgeMock).toHaveBeenCalledWith({ kind: 'character', userId: USER, characterId: CHAR });
    expect(runPurgeMock).toHaveBeenCalledTimes(1);
  });

  it('returns accountEmptied:false for a one-of-many purge, rebinding email + repointing active', async () => {
    state.results = [
      [{ accountId: String(OTHER) }], // remaining → survivor
      [{ email: syntheticEmail(CHAR), activeCharacterId: CHAR }], // freed char was the identity email + active
      undefined, // email rebind update
      [{ accountId: String(OTHER) }], // repointActiveToOldest select
      undefined, // repointActiveToOldest update
    ];
    const out = await purgeOwnCharacter(USER, CHAR);
    expect(out).toEqual({ accountEmptied: false });
    expect(state.calls.delete).toBe(0); // user NOT deleted
    expect(state.calls.update).toBe(2); // email rebind + repoint
  });

  it('returns accountEmptied:true for the last character, deleting the emptied user', async () => {
    state.results = [
      [], // remaining → none
      undefined, // delete user row
    ];
    const out = await purgeOwnCharacter(USER, CHAR);
    expect(out).toEqual({ accountEmptied: true });
    expect(state.calls.delete).toBe(1); // the user row (sessions/preferences/structures cascade)
  });
});

describe('nukeAccount', () => {
  it('revokes + sweeps every linked character, sweeps the user, then deletes the user', async () => {
    state.results = [
      [{ accountId: String(CHAR) }, { accountId: String(OTHER) }], // pass 1 enumeration
      [], // pass 2 re-enumeration → no newcomers, loop exits
      undefined, // delete user row
    ];
    await nukeAccount(USER);

    // Each character's EVE grant revoked (best-effort), in enumeration order.
    expect(revokeMock.mock.calls).toEqual([[CHAR], [OTHER]]);
    // N character purges + 1 user purge.
    expect(runPurgeMock).toHaveBeenCalledTimes(3);
    expect(runPurgeMock).toHaveBeenNthCalledWith(1, { kind: 'character', userId: USER, characterId: CHAR });
    expect(runPurgeMock).toHaveBeenNthCalledWith(2, { kind: 'character', userId: USER, characterId: OTHER });
    expect(runPurgeMock).toHaveBeenNthCalledWith(3, { kind: 'user', userId: USER });
    expect(state.calls.delete).toBe(1); // the user row; the cascade finishes the rest
  });

  it('re-enumerates until empty, catching a character linked mid-nuke (no cascade orphan)', async () => {
    state.results = [
      [{ accountId: String(CHAR) }], // pass 1: one linked
      [{ accountId: String(OTHER) }], // pass 2: a newcomer linked during pass 1
      [], // pass 3: empty → loop exits
      undefined, // delete user row
    ];
    await nukeAccount(USER);

    // The newcomer is swept too, so its character-keyed caches don't orphan.
    expect(revokeMock.mock.calls).toEqual([[CHAR], [OTHER]]);
    expect(runPurgeMock).toHaveBeenCalledTimes(3); // 2 character purges + 1 user purge
    expect(state.calls.delete).toBe(1);
  });
});
