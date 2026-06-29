import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticEmail } from './synthetic-email';

// Chainable thenable emulating Drizzle's builder (the queries.reassign.test.ts
// house pattern): every awaited chain resolves with the next FIFO result, and
// delete/update calls are counted so each reconcile path's writes are assertable.
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

import { purgeTransferredCharacter, reconcileCharacterOwner } from './queries';

const USER = 'eve-user-1';
const CHAR = 90000001;
const OTHER_CHAR = 90000002;
const H1 = 'owner-hash-one';
const H2 = 'owner-hash-two';

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
});

describe('reconcileCharacterOwner', () => {
  it('no-ops when the JWT carries no owner claim (no DB read, no purge)', async () => {
    await reconcileCharacterOwner(CHAR, undefined);
    expect(state.calls).toEqual({ delete: 0, update: 0 });    // The lookup never ran — the seeded result (none) was never consumed.
    expect(state.results).toEqual([]);
  });

  it('no-ops for the common re-login (stored hash matches)', async () => {
    state.results = [[{ userId: USER, ownerHash: H1 }]];
    await reconcileCharacterOwner(CHAR, H1);
    expect(state.calls).toEqual({ delete: 0, update: 0 });  });

  it('backfills a legacy null-hash row with a single update, never purging', async () => {
    state.results = [[{ userId: USER, ownerHash: null }], undefined];
    await reconcileCharacterOwner(CHAR, H1);
    expect(state.calls).toEqual({ delete: 0, update: 1 });  });

  it('no-ops when the character has no account row yet (first link)', async () => {
    state.results = [[]]; // lookup finds nothing
    await reconcileCharacterOwner(CHAR, H1);
    expect(state.calls).toEqual({ delete: 0, update: 0 });  });

  it('purges when the stored hash differs (a transfer)', async () => {
    state.results = [
      [{ userId: USER, ownerHash: H1 }], // reconcile lookup → mismatch H1≠H2
      [{ id: 'acc-1' }], // deleteLinkedCharacter .returning
      undefined, // characters.preferences reset
      [], // remaining eve accounts → account-less
      undefined, // delete prior-owner user row
    ];
    await reconcileCharacterOwner(CHAR, H2);
    // account row + user row both deleted; characters reset once.
    expect(state.calls).toEqual({ delete: 2, update: 1 });  });
});

describe('purgeTransferredCharacter', () => {
  it('deletes the account-less prior owner (account + user), resets profile', async () => {
    state.results = [
      [{ id: 'acc-1' }], // deleteLinkedCharacter .returning
      undefined, // characters.preferences reset
      [], // remaining eve accounts → none
      undefined, // delete user row
    ];
    await purgeTransferredCharacter(USER, CHAR);
    expect(state.calls).toEqual({ delete: 2, update: 1 });  });

  it('keeps a multi-character prior owner: rebinds the identity email + repoints active', async () => {
    state.results = [
      [{ id: 'acc-1' }], // deleteLinkedCharacter .returning
      undefined, // characters.preferences reset
      [{ accountId: String(OTHER_CHAR) }], // remaining → one survivor (multi-char)
      // prior owner's email IS the freed character's synthetic address + active == freed char
      [{ email: syntheticEmail(CHAR), activeCharacterId: CHAR }],
      undefined, // email rebind update
      [{ accountId: String(OTHER_CHAR) }], // repointActiveToOldest select
      undefined, // repointActiveToOldest update
    ];
    await purgeTransferredCharacter(USER, CHAR);
    // account deleted (1), user row NOT deleted; characters reset + email rebind + repoint = 3 updates.
    expect(state.calls).toEqual({ delete: 1, update: 3 });  });

  it('keeps a multi-character prior owner untouched when the freed char is neither their email nor active', async () => {
    state.results = [
      [{ id: 'acc-1' }], // deleteLinkedCharacter .returning
      undefined, // characters.preferences reset
      [{ accountId: String(OTHER_CHAR) }], // remaining → one survivor
      // identity email + active point at a DIFFERENT surviving character
      [{ email: syntheticEmail(OTHER_CHAR), activeCharacterId: OTHER_CHAR }],
    ];
    await purgeTransferredCharacter(USER, CHAR);
    // account deleted (1); only the characters reset writes (1) — no rebind, no repoint.
    expect(state.calls).toEqual({ delete: 1, update: 1 });  });
});
