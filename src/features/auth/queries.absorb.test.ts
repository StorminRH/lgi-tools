import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// absorbLinkedCharacterOnProof's decision forks — never absorb without a link
// state, never absorb your own row, and the emptied/not-emptied source fork
// (reconcile composition adds ONLY the identity-email rebind). The Drizzle
// calls are stubbed with the queries.reassign.test.ts chainable thenable:
// every builder method returns the same object, awaiting it resolves the next
// queued result (FIFO). getOAuthState is mocked settable so link/sign-in/throw
// are each pinned; the mechanism itself (state timing, relink conversion) is
// pinned end-to-end by absorb-link.spike.test.ts.
const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0 },
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['set', 'where', 'select', 'from', 'limit', 'orderBy']) {
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

const oauthState = vi.hoisted(() => ({ value: null as unknown, shouldThrow: false }));

vi.mock('@/db', () => ({ db: chain }));
vi.mock('better-auth/api', () => ({
  getOAuthState: async () => {
    if (oauthState.shouldThrow) throw new Error('No request state found.');
    return oauthState.value;
  },
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: vi.fn().mockResolvedValue(undefined),
}));

import { logUsageEvent } from '@/data/telemetry/queries';
import { absorbLinkedCharacterOnProof } from './queries';
import { syntheticEmail } from './synthetic-email';

const CHARACTER = 100;

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  oauthState.value = null;
  oauthState.shouldThrow = false;
  vi.mocked(logUsageEvent).mockClear();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('absorbLinkedCharacterOnProof', () => {
  it('never absorbs on a sign-in flow (no link in the OAuth state)', async () => {
    oauthState.value = { callbackURL: '/' }; // parsed state without link
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: false });
    expect(state.calls).toEqual({ delete: 0, update: 0 });
    expect(state.results).toHaveLength(0); // no DB read at all
  });

  it('no-ops on a fresh link (no account row for the character)', async () => {
    oauthState.value = { link: { userId: 'user-b' } };
    state.results = [[]]; // row lookup finds nothing
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: false });
    expect(state.calls).toEqual({ delete: 0, update: 0 });
  });

  it('no-ops when the character already belongs to the linking user (normal relink)', async () => {
    oauthState.value = { link: { userId: 'user-b' } };
    state.results = [[{ userId: 'user-b' }]];
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: false });
    expect(state.calls).toEqual({ delete: 0, update: 0 });
    expect(vi.mocked(logUsageEvent)).not.toHaveBeenCalled();
  });

  it('absorbs and deletes the emptied source user, skipping the reconcile', async () => {
    oauthState.value = { link: { userId: 'user-b' } };
    // awaits: absorb row-lookup → move update → reassign remaining (empty) →
    // delete source user. Reconcile must NOT run on this fork.
    state.results = [[{ userId: 'stray' }], undefined, [], undefined];
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: true });
    expect(state.calls).toEqual({ delete: 1, update: 1 });
    expect(state.results).toHaveLength(0); // exactly four awaits — no reconcile reads
    expect(vi.mocked(logUsageEvent)).toHaveBeenCalledWith({
      action: 'auth_absorb',
      characterId: CHARACTER,
      metadata: { fromUserId: 'stray', toUserId: 'user-b', sourceDeleted: true },
    });
  });

  it('absorbs from a surviving source and rebinds its identity email', async () => {
    oauthState.value = { link: { userId: 'user-b' } };
    // awaits: absorb row-lookup → move update → reassign remaining (sibling) →
    // stored-active (999 ≠ moved, no repoint) → reconcile remaining →
    // reconcile user row (email IS the moved character's) → email rebind update.
    state.results = [
      [{ userId: 'stray' }],
      undefined,
      [{ id: 'acc-other' }],
      [{ activeCharacterId: 999 }],
      [{ accountId: '222' }],
      [{ email: syntheticEmail(CHARACTER), activeCharacterId: 999 }],
      undefined,
    ];
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: true });
    expect(state.calls).toEqual({ delete: 0, update: 2 }); // move + the rebind
    expect(state.results).toHaveLength(0);
    expect(vi.mocked(logUsageEvent)).toHaveBeenCalledWith({
      action: 'auth_absorb',
      characterId: CHARACTER,
      metadata: { fromUserId: 'stray', toUserId: 'user-b', sourceDeleted: false },
    });
  });

  it('absorbs from a surviving source without touching an unrelated identity email', async () => {
    oauthState.value = { link: { userId: 'user-b' } };
    state.results = [
      [{ userId: 'stray' }],
      undefined,
      [{ id: 'acc-other' }],
      [{ activeCharacterId: 999 }],
      [{ accountId: '222' }],
      [{ email: syntheticEmail(222), activeCharacterId: 999 }],
    ];
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: true });
    expect(state.calls).toEqual({ delete: 0, update: 1 }); // the move only
    expect(state.results).toHaveLength(0);
  });

  it('degrades to no-absorb when the OAuth state is unavailable', async () => {
    oauthState.shouldThrow = true;
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: false });
    expect(state.calls).toEqual({ delete: 0, update: 0 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
