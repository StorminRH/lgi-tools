import { describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { corporationsOf, OWNER_SYNC_CONCURRENCY, runOwnerSync } from './engine';
import type { CorpOwnerAxis, OwnerSyncDescriptor, PersistVerdict, ReadSession } from './types';
import { ownerFixture, readSessionFake } from './__tests__/owner-fixtures';

const NOW = new Date('2026-06-29T12:00:00Z');

type State = { lastRefreshedAt: Date | null };
type Save = { value: number };

const corpAxis = (
  readRoles: CorpOwnerAxis<string>['readRoles'],
): CorpOwnerAxis<string> => ({
  eligible: () => true,
  ownerOf: (userId, corporationId) => `corp:${userId}:${corporationId}`,
  requiredRoles: ['Director'],
  readRoles,
});

/** Every session the descriptor opened, in order, so a test can see which were committed. */
function sessions(): { opened: ReadSession[]; openSession: () => ReadSession } {
  const opened: ReadSession[] = [];
  return {
    opened,
    openSession: () => {
      const session = readSessionFake();
      opened.push(session);
      return session;
    },
  };
}

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
    isDue: vi.fn(async () => true),
    openSession: () => readSessionFake(),
    readState: vi.fn(async () => null),
    fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'save', value: 1 })),
    save: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    characterAxis: { eligible: () => true, ownerOf: (characterId: number) => `char:${characterId}` },
    ...overrides,
  };
}

describe('runOwnerSync — the per-owner dance', () => {
  it('does zero work for an owner that is not due (the due check comes before the state read and the vend)', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [ownerFixture(1)]), isDue: vi.fn(async () => false) });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([{ kind: 'succeeded', target: { ownerType: 'character', ownerId: 1 } }]);
    expect(d.readState).not.toHaveBeenCalled();
    expect(d.vendToken).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
    expect(d.stampFresh).not.toHaveBeenCalled();
  });

  it('vends, fetches with a session and saves a due character owner, then commits the session', async () => {
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      openSession,
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'save', value: 7 })),
    });

    await runOwnerSync(d, 'u');

    expect(d.isDue).toHaveBeenCalledWith('char:1');
    expect(d.vendToken).toHaveBeenCalledWith(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('char:1', 'tok-1', null, opened[0]);
    expect(d.save).toHaveBeenCalledWith('char:1', { kind: 'save', value: 7 });
    expect(opened).toHaveLength(1);
    expect(opened[0]!.commit).toHaveBeenCalledOnce();
    expect(vi.mocked(opened[0]!.commit).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(d.save).mock.invocationCallOrder[0]!,
    );
  });

  it('stamps (no save) on a stamp verdict and commits after the stamp', async () => {
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      openSession,
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'stamp' })),
    });

    await runOwnerSync(d, 'u');

    expect(d.stampFresh).toHaveBeenCalledWith('char:1');
    expect(d.save).not.toHaveBeenCalled();
    expect(opened[0]!.commit).toHaveBeenCalledOnce();
  });

  it('does nothing on a skip verdict and never commits the session', async () => {
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      openSession,
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'skip' })),
    });

    await runOwnerSync(d, 'u');

    expect(d.save).not.toHaveBeenCalled();
    expect(d.stampFresh).not.toHaveBeenCalled();
    expect(opened[0]!.commit).not.toHaveBeenCalled();
  });

  it('discards the session when the save throws, so nothing is recorded for data that was not stored', async () => {
    const { opened, openSession } = sessions();
    const failure = new Error('neon unavailable');
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      openSession,
      save: vi.fn(async () => {
        throw failure;
      }),
    });

    await expect(runOwnerSync(d, 'u')).rejects.toBe(failure);

    expect(opened[0]!.commit).not.toHaveBeenCalled();
  });

  it('skips a character whose grant is lost (no fetch)', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [ownerFixture(1)]), vendToken: vi.fn(async () => ({ missing: 'lost' as const })) });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([{ kind: 'failed_permanent', target: { ownerType: 'character', ownerId: 1 }, code: 'token_unavailable' }]);
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('skips an ineligible character before any due check, state read or vend', async () => {
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      characterAxis: { eligible: () => false, ownerOf: (id) => `char:${id}` },
    });

    await runOwnerSync(d, 'u');

    expect(d.isDue).not.toHaveBeenCalled();
    expect(d.readState).not.toHaveBeenCalled();
    expect(d.vendToken).not.toHaveBeenCalled();
  });

  it('skips an owner whose precondition returns false — before any due check, state read or vend', async () => {
    const precondition = vi.fn(async () => false);
    const d = makeDescriptor({ enumerate: vi.fn(async () => [ownerFixture(1)]), precondition });

    await runOwnerSync(d, 'u');

    expect(precondition).toHaveBeenCalledWith('char:1');
    expect(d.isDue).not.toHaveBeenCalled();
    expect(d.readState).not.toHaveBeenCalled();
    expect(d.vendToken).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('proceeds normally when the precondition returns true', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [ownerFixture(1)]), precondition: vi.fn(async () => true) });

    await runOwnerSync(d, 'u');

    expect(d.readState).toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith('char:1', { kind: 'save', value: 1 });
  });

  it('refreshes multiple eligible characters in one pass', async () => {
    const d = makeDescriptor({ enumerate: vi.fn(async () => [ownerFixture(1), ownerFixture(2), ownerFixture(3)]) });

    await runOwnerSync(d, 'u');

    expect(d.save).toHaveBeenCalledTimes(3);
  });

  it('refreshes at most OWNER_SYNC_CONCURRENCY owners at once, in enumeration order', async () => {
    let inFlight = 0;
    let peak = 0;
    const started: string[] = [];
    const d = makeDescriptor({
      enumerate: vi.fn(async () => Array.from({ length: 20 }, (_, i) => ownerFixture(i + 1))),
      fetchAndPlan: vi.fn(async (owner: string): Promise<PersistVerdict<Save>> => {
        started.push(owner);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { kind: 'save', value: 1 };
      }),
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toHaveLength(20);
    expect(d.save).toHaveBeenCalledTimes(20);
    expect(started.slice(0, 3)).toEqual(['char:1', 'char:2', 'char:3']);
    expect(peak).toBe(OWNER_SYNC_CONCURRENCY);
    expect(OWNER_SYNC_CONCURRENCY).toBe(8);
  });

  it('reports a budget refusal for the owner, discards its session and leaves the next view to retry', async () => {
    const error = new EsiBudgetExhaustedError(
      17,
      'rate_limited',
      900,
      '/characters/1/skills/',
    );
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1), ownerFixture(2)]),
      openSession,
      fetchAndPlan: vi.fn(async (owner: string): Promise<PersistVerdict<Save>> => {
        if (owner === 'char:1') throw error;
        return { kind: 'save', value: 2 };
      }),
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([
      {
        kind: 'deferred_for_budget',
        target: { ownerType: 'character', ownerId: 1 },
        error,
      },
      { kind: 'succeeded', target: { ownerType: 'character', ownerId: 2 } },
    ]);
    expect(d.save).toHaveBeenCalledExactlyOnceWith('char:2', { kind: 'save', value: 2 });
    expect(d.stampFresh).not.toHaveBeenCalled();
    expect(opened.map((session) => vi.mocked(session.commit).mock.calls.length)).toEqual([0, 1]);
  });

  it('records the gate state on a character needs_role verdict when saveGateState is defined, without committing', async () => {
    const saveGateState = vi.fn(async () => {});
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      openSession,
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'needs_role' })),
      saveGateState,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([{ kind: 'failed_permanent', target: { ownerType: 'character', ownerId: 1 }, code: 'needs_role' }]);
    expect(saveGateState).toHaveBeenCalledWith('char:1');
    expect(d.save).not.toHaveBeenCalled();
    expect(opened[0]!.commit).not.toHaveBeenCalled();
  });
});

describe('corporationsOf', () => {
  it('groups eligible members by corporation and leaves out the ineligible and the corp-less', () => {
    const owners = [
      ownerFixture(1, { corporationId: 5000 }),
      ownerFixture(2, { corporationId: 5000, hasRefreshToken: false }),
      ownerFixture(3, { corporationId: 6000 }),
      ownerFixture(4),
    ];
    const byCorp = corporationsOf(owners, (owner) => owner.hasRefreshToken);
    expect([...byCorp.keys()]).toEqual([5000, 6000]);
    expect(byCorp.get(5000)).toEqual([owners[0]]);
    expect(byCorp.get(6000)).toEqual([owners[2]]);
    expect(corporationsOf(owners, () => false).size).toBe(0);
  });
});

describe('runOwnerSync — the corporation pass', () => {
  it('syncs a corp once with the first role-holder token', async () => {
    const readRoles = vi.fn(async (characterId: number) => (characterId === 2 ? ['Director'] : []));
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 }), ownerFixture(2, { corporationId: 5000 })]),
      corpAxis: corpAxis(readRoles),
    });

    await runOwnerSync(d, 'u');

    expect(d.fetchAndPlan).toHaveBeenCalledTimes(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('corp:u:5000', 'tok-2', null, expect.anything());
  });

  it('records needs_role for a corp with no role-holder (saveGateState defined)', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
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
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
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
      vendToken: vi.fn(async () => ({ missing: 'unavailable' as const })),
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
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

  it('retries a corp whose only other member is temporarily unavailable, without saving gate state', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      vendToken: vi.fn(async (characterId: number) => (characterId === 2 ? { missing: 'unavailable' as const } : `tok-${characterId}`)),
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 }), ownerFixture(2, { corporationId: 5000 })]),
      corpAxis: corpAxis(vi.fn(async () => [])),
      saveGateState,
    });

    const results = await runOwnerSync(d, 'u');

    expect(saveGateState).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        kind: 'failed_retryable',
        target: { ownerType: 'corporation', ownerId: 5000 },
        code: 'owner_temporarily_unavailable',
      },
    ]);
  });

  it('never vends later members once the first member is sufficient', async () => {
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [1, 2, 3].map((id) => ownerFixture(id, { corporationId: 5000 }))),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
    });

    await runOwnerSync(d, 'u');

    expect(d.vendToken).toHaveBeenCalledTimes(1);
    expect(d.vendToken).toHaveBeenCalledWith(1);
    expect(d.fetchAndPlan).toHaveBeenCalledWith('corp:u:5000', 'tok-1', null, expect.anything());
  });

  it('tries the next role-holder when ESI refuses the first, and commits only the try that saved', async () => {
    const saveGateState = vi.fn(async () => {});
    const { opened, openSession } = sessions();
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [1, 2, 3].map((id) => ownerFixture(id, { corporationId: 5000 }))),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      openSession,
      fetchAndPlan: vi.fn(async (_owner, accessToken): Promise<PersistVerdict<Save>> =>
        accessToken === 'tok-1' ? { kind: 'needs_role' } : { kind: 'save', value: 2 },
      ),
      saveGateState,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([{ kind: 'succeeded', target: { ownerType: 'corporation', ownerId: 5000 } }]);
    expect(vi.mocked(d.vendToken).mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(d.fetchAndPlan).toHaveBeenCalledTimes(2);
    expect(d.save).toHaveBeenCalledExactlyOnceWith('corp:u:5000', { kind: 'save', value: 2 });
    expect(saveGateState).not.toHaveBeenCalled();
    expect(opened.map((session) => vi.mocked(session.commit).mock.calls.length)).toEqual([0, 1]);
  });

  it('records needs_role only after every role-holder was refused', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: vi.fn(async () => [1, 2].map((id) => ownerFixture(id, { corporationId: 5000 }))),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'needs_role' })),
      saveGateState,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([
      { kind: 'failed_permanent', target: { ownerType: 'corporation', ownerId: 5000 }, code: 'needs_role' },
    ]);
    expect(d.fetchAndPlan).toHaveBeenCalledTimes(2);
    expect(saveGateState).toHaveBeenCalledExactlyOnceWith('corp:u:5000');
    expect(vi.mocked(saveGateState).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(d.fetchAndPlan).mock.invocationCallOrder[1]!,
    );
  });

  it('still records needs_role when the refused role-holder was the only one judged', async () => {
    const saveGateState = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      vendToken: vi.fn(async (characterId: number) => (characterId === 2 ? { missing: 'unavailable' as const } : `tok-${characterId}`)),
      enumerate: vi.fn(async () => [1, 2].map((id) => ownerFixture(id, { corporationId: 5000 }))),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'needs_role' })),
      saveGateState,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results[0]).toMatchObject({ kind: 'failed_permanent', code: 'needs_role' });
    expect(saveGateState).toHaveBeenCalledOnce();
  });

  it('reads no roles for a corp that is not due (the due check comes before director resolution)', async () => {
    const readRoles = vi.fn(async () => ['Director']);
    const d = makeDescriptor({
      characterAxis: undefined,
      isDue: vi.fn(async () => false),
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
      corpAxis: corpAxis(readRoles),
    });

    await runOwnerSync(d, 'u');

    expect(d.vendToken).not.toHaveBeenCalled();
    expect(readRoles).not.toHaveBeenCalled();
  });

  it('runs the character pass THEN the corp pass for a both-axis slice', async () => {
    const order: string[] = [];
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
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

describe('runOwnerSync — settled refusals are recorded as the owner\'s answer', () => {
  const corpMembers = (...ids: number[]) => vi.fn(async () => ids.map((id) => ownerFixture(id, { corporationId: 5000 })));

  it('records needs_role for a corp until the earliest 403 Expires, after the gate state', async () => {
    const saveGateState = vi.fn(async () => {});
    const recordRefusal = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: corpMembers(1, 2, 3),
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      fetchAndPlan: vi.fn(async (_owner, accessToken): Promise<PersistVerdict<Save>> => {
        if (accessToken === 'tok-1') return { kind: 'needs_role', expiresAt: 9_000 };
        return accessToken === 'tok-2' ? { kind: 'needs_role', expiresAt: 4_000 } : { kind: 'needs_role' };
      }),
      saveGateState,
      recordRefusal,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([
      { kind: 'failed_permanent', target: { ownerType: 'corporation', ownerId: 5000 }, code: 'needs_role' },
    ]);
    expect(recordRefusal).toHaveBeenCalledExactlyOnceWith('corp:u:5000', 4_000);
    expect(vi.mocked(recordRefusal).mock.invocationCallOrder[0]).toBeGreaterThan(saveGateState.mock.invocationCallOrder[0]!);
  });

  it('records needs_role with no Expires when ESI sent none, so the route\'s spec cache time applies', async () => {
    const recordRefusal = vi.fn(async () => {});
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      fetchAndPlan: vi.fn(async (): Promise<PersistVerdict<Save>> => ({ kind: 'needs_role' })),
      recordRefusal,
    });

    await runOwnerSync(d, 'u');

    expect(recordRefusal).toHaveBeenCalledExactlyOnceWith('char:1', null);
  });

  it('records a corp whose every member was judged and none holds the role (denied) without reading it', async () => {
    const recordRefusal = vi.fn(async () => {});
    const d = makeDescriptor({
      characterAxis: undefined,
      enumerate: corpMembers(1, 2),
      corpAxis: corpAxis(vi.fn(async () => [])),
      recordRefusal,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results[0]).toMatchObject({ kind: 'failed_permanent', code: 'needs_role' });
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
    expect(recordRefusal).toHaveBeenCalledExactlyOnceWith('corp:u:5000', null);
  });

  it('records a character whose grant is lost (token_unavailable)', async () => {
    const recordRefusal = vi.fn(async () => {});
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      vendToken: vi.fn(async () => ({ missing: 'lost' as const })),
      recordRefusal,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results[0]).toMatchObject({ kind: 'failed_permanent', code: 'token_unavailable' });
    expect(recordRefusal).toHaveBeenCalledExactlyOnceWith('char:1', null);
  });

  it('records nothing for a character whose token service failed for now, and keeps it retryable', async () => {
    const recordRefusal = vi.fn(async () => {});
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1)]),
      vendToken: vi.fn(async () => ({ missing: 'unavailable' as const })),
      recordRefusal,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([
      { kind: 'failed_retryable', target: { ownerType: 'character', ownerId: 1 }, code: 'owner_temporarily_unavailable' },
    ]);
    expect(recordRefusal).not.toHaveBeenCalled();
    expect(d.fetchAndPlan).not.toHaveBeenCalled();
  });

  it('records nothing for a transient end: a 5xx, a skip, a budget refusal, or a member not judged for now', async () => {
    const recordRefusal = vi.fn(async () => {});
    const budget = new EsiBudgetExhaustedError(17, 'rate_limited', 900, '/characters/3/skills/');
    const d = makeDescriptor({
      enumerate: vi.fn(async () => [ownerFixture(1), ownerFixture(2), ownerFixture(3), ownerFixture(4, { corporationId: 5000 })]),
      vendToken: vi.fn(async (characterId: number) => (characterId === 4 ? { missing: 'unavailable' as const } : `tok-${characterId}`)),
      characterAxis: { eligible: (owner) => owner.corporationId === null, ownerOf: (characterId: number) => `char:${characterId}` },
      corpAxis: corpAxis(vi.fn(async () => ['Director'])),
      fetchAndPlan: vi.fn(async (owner: string): Promise<PersistVerdict<Save>> => {
        if (owner === 'char:1') return { kind: 'skip', code: 'esi_server_error' };
        if (owner === 'char:2') return { kind: 'skip', code: 'contract_error' };
        throw budget;
      }),
      recordRefusal,
    });

    const results = await runOwnerSync(d, 'u');

    expect(results).toEqual([
      { kind: 'failed_retryable', target: { ownerType: 'character', ownerId: 1 }, code: 'esi_server_error' },
      { kind: 'failed_permanent', target: { ownerType: 'character', ownerId: 2 }, code: 'contract_error' },
      { kind: 'deferred_for_budget', target: { ownerType: 'character', ownerId: 3 }, error: budget },
      { kind: 'failed_retryable', target: { ownerType: 'corporation', ownerId: 5000 }, code: 'owner_temporarily_unavailable' },
    ]);
    expect(recordRefusal).not.toHaveBeenCalled();
  });
});
