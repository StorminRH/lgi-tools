import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0 },
  };
  const chain: Record<string, unknown> = {

    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const next = state.results.shift();
      if (next instanceof Error) reject(next);
      else resolve(next);
    },
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

vi.mock('./identity-projection-hooks', () => ({
  runBeforeUserDelete: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
}));

import { logUsageEvent } from '@/data/telemetry/queries';
import { absorbLinkedCharacterOnProof } from './owner-transfer';
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
    expect(state.calls).toEqual({ delete: 0, update: 1 });
    expect(state.results).toHaveLength(0);
  });

  it('still reports the absorb when source cleanup fails after the move committed', async () => {
    oauthState.value = { link: { userId: 'user-b' } };

    state.results = [
      [{ userId: 'stray' }],
      undefined,
      [{ id: 'acc-other' }],
      [{ activeCharacterId: 999 }],
      new Error('transient db failure'),
    ];
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: true });
    expect(state.calls).toEqual({ delete: 0, update: 1 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logUsageEvent)).toHaveBeenCalledWith({
      action: 'auth_absorb',
      characterId: CHARACTER,
      metadata: { fromUserId: 'stray', toUserId: 'user-b', sourceDeleted: false },
    });
  });

  it('degrades to no-absorb when the OAuth state is unavailable', async () => {
    oauthState.shouldThrow = true;
    const out = await absorbLinkedCharacterOnProof(CHARACTER);
    expect(out).toEqual({ absorbed: false });
    expect(state.calls).toEqual({ delete: 0, update: 0 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
