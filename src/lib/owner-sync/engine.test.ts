import { describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/lib/esi';
import { runOwnerSync } from './engine';
import type { CorpOwnerAxis, EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict } from './types';

const NOW = new Date('2026-06-29T12:00:00Z');

type State = { lastRefreshedAt: Date | null };
type Save = { value: number };

const owner = (characterId: number, extra: Partial<EnumeratedOwner> = {}): EnumeratedOwner => ({
  characterId,
  corporationId: null,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

// A corp axis whose Director gate admits a member iff its readRoles returns the role.
const corpAxis = (
  readRoles: CorpOwnerAxis<string>['readRoles'],
): CorpOwnerAxis<string> => ({
  eligible: () => true,
  ownerOf: (userId, corporationId) => `corp:${userId}:${corporationId}`,
  requiredRoles: ['Director'],
  readRoles,
});

function makeDescriptor(
  overrides: Partial<OwnerSyncDescriptor<string, State, Save>> = {},
): OwnerSyncDescriptor<string, State, Save> {
  return {
    now: () => NOW,
    enumerate: vi.fn(async () => []),
    identityOf: (value) => {
      const [kind, first, second] = value.split(':');
      return {
        ownerType: kind === 'corp' ? 'corporation' : 'character',
        ownerId: Number(kind === 'corp' ? second : first),
      };
    },
    vendToken: vi.fn(async (characterId: number) => `tok-${characterId}`),
    isStale: vi.fn(() => true),
    readState: vi.fn(async () => null),
    fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'save', value: 1 })),
    save: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    characterAxis: { eligible: () => true, ownerOf: (characterId: number) => `char:${characterId}` },
    ...overrides,
  };
}

describe('runOwnerSync — the per-owner dance', () => {
  it('does zero work for a fresh owner (stale gate before vend)', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1)]), isStale: vi.fn(() => false) });

    await runOwnerSync(d, 'u');

    expect(d.vendToken).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
    expect(d.stampFresh).not.toHaveBeenCalled();
  });

  it('vends, fetches and saves a stale character owner', async () => {
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'save', value: 7 })),
    });

    await runOwnerSync(d, 'u');

    expect(d.vendToken).toHaveBeenCalledWith(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('char:1', 'tok-1', null);
    expect(d.save).toHaveBeenCalledWith('char:1', { kind: 'save', value: 7 });
  });

  it('stamps (no save) on a stamp verdict', async () => {
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'stamp' })),
    });

    await runOwnerSync(d, 'u');

    expect(d.stampFresh).toHaveBeenCalledWith('char:1');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('does nothing on a skip verdict', async () => {
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'skip' })),
    });

    await runOwnerSync(d, 'u');

    expect(d.save).not.toHaveBeenCalled();
    expect(d.stampFresh).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be vended (no fetch)', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1)]), vendToken: vi.fn(async () => null) });

    await runOwnerSync(d, 'u');

    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('skips an ineligible character before any state read or vend', async () => {
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      characterAxis: { eligible: () => false, ownerOf: (id) => `char:${id}` },
    });

    await runOwnerSync(d, 'u');

    expect(d.readState).not.toHaveBeenCalled();
    expect(d.vendToken).not.toHaveBeenCalled();
  });

  it('skips an owner whose precondition returns false — before any state read or vend', async () => {
    const precondition = vi.fn(async () => false);
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1)]), precondition });

    await runOwnerSync(d, 'u');

    expect(precondition).toHaveBeenCalledWith('char:1');
    expect(d.readState).not.toHaveBeenCalled();
    expect(d.vendToken).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('proceeds normally when the precondition returns true', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1)]), precondition: vi.fn(async () => true) });

    await runOwnerSync(d, 'u');

    expect(d.readState).toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith('char:1', { kind: 'save', value: 1 });
  });

  it('refreshes multiple eligible characters in one pass', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1), owner(2), owner(3)]) });

    await runOwnerSync(d, 'u');

    expect(d.save).toHaveBeenCalledTimes(3);
  });

  it('runs only the requested deferred owner', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [owner(1), owner(2)]) });

    const results = await runOwnerSync(d, 'u', {
      target: { ownerType: 'character', ownerId: 2 },
    });

    expect(d.fetchAndPlan).toHaveBeenCalledTimes(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('char:2', 'tok-2', null);
    expect(results).toEqual([
      { kind: 'succeeded', target: { ownerType: 'character', ownerId: 2 } },
    ]);
  });

  it('reports budget metadata and enqueues the exact owner through the callback', async () => {
    const error = new EsiBudgetExhaustedError(
      17,
      'rate_limited',
      900,
      '/characters/1/skills/',
    );
    const onBudgetDeferred = vi.fn(async () => {});
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      fetchAndPlan: vi.fn(async () => {
        throw error;
      }),
    });

    const results = await runOwnerSync(d, 'u', { onBudgetDeferred });

    expect(onBudgetDeferred).toHaveBeenCalledWith(
      { ownerType: 'character', ownerId: 1 },
      error,
    );
    expect(results).toEqual([
      {
        kind: 'deferred_for_budget',
        target: { ownerType: 'character', ownerId: 1 },
        error,
      },
    ]);
  });

  it('records the gate state on a needs_role verdict when saveGateState is defined', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1)]),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'needs_role' })),
      saveGateState,
    });

    await runOwnerSync(d, 'u');

    expect(saveGateState).toHaveBeenCalledWith('char:1');
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe('runOwnerSync — the corporation pass', () => {
  it('syncs a corp once with the first role-holder token', async () => {
    const readRoles = vi.fn(async (characterId: number) => (characterId === 2 ? ['Director'] : []));
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 }), owner(2, { corporationId: 5000 })]),
      corpAxis: corpAxis(readRoles),
    });

    await runOwnerSync(d, 'u');

    expect(d.fetchAndPlan).toHaveBeenCalledTimes(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('corp:u:5000', 'tok-2', null);
  });

  it('records needs_role for a corp with no role-holder (saveGateState defined)', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(vi.fn(async () => [])),
      saveGateState,
    });

    await runOwnerSync(d, 'u');

    expect(saveGateState).toHaveBeenCalledWith('corp:u:5000');
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
  });

  it('skips a corp with no role-holder when saveGateState is undefined', async () => {
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(vi.fn(async () => [])),
    });

    await runOwnerSync(d, 'u');

    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('skips a corp when no member can be vended (unavailable — no role read)', async () => {
    const readRoles = vi.fn(async () => ['Director']);
    const d = makeDescriptor({
      characterAxis: undefined,
      vendToken: vi.fn(async () => null),
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(readRoles),
    });

    const results = await runOwnerSync(d, 'u');

    expect(readRoles).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        kind: 'failed_retryable',
        target: { ownerType: 'corporation', ownerId: 5000 },
        code: 'owner_temporarily_unavailable',
      },
    ]);
  });

  it('reads no roles for a fresh corp (stale gate before director resolution)', async () => {
    const readRoles = vi.fn(async () => ['Director']);
    const d = makeDescriptor({
      characterAxis: undefined,
      isStale: vi.fn(() => false),
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(readRoles),
    });

    await runOwnerSync(d, 'u');

    expect(d.vendToken).not.toHaveBeenCalled();
    expect(readRoles).not.toHaveBeenCalled();
  });

  it('runs the character pass THEN the corp pass for a both-axis slice', async () => {
    const order: string[] = [];
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [owner(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      fetchAndPlan: vi.fn(async (o: string): Promise<PersistVerdict<Save>> => {
        order.push(o);
        return { kind: 'save', value: 1 };
      }),
    });

    await runOwnerSync(d, 'u');

    expect(order).toEqual(['char:1', 'corp:u:5000']);
  });
});
