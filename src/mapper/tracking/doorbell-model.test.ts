import { describe, expect, it, vi } from 'vitest';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import {
  DOORBELL_ATTEMPT_CAP,
  ownTrackedDoorbellRows,
  pendingDoorbells,
  ringAnswered,
  ringDispatched,
  ringOwnDoorbells,
  ringPendingTransitions,
  type DoorbellMemoryEntry,
} from './doorbell-model';

function tracked(characterId: number, transitionObservedAt: number | null) {
  return { characterId, location: { transitionObservedAt } };
}

function response(
  status: JumpResolverResponse['status'],
): JumpResolverResponse {
  if (status === 'processed') {
    return { status, outcome: 'authored', emitted: false };
  }
  return { status, reason: 'x' } as JumpResolverResponse;
}

describe('own-character doorbell filter', () => {
  it('waits for feed + own ids, keeps only this client\'s rows, and rings only those characters', async () => {
    expect(ownTrackedDoorbellRows(undefined, [101])).toBeNull();
    expect(ownTrackedDoorbellRows([tracked(101, 5_000)], undefined)).toBeNull();
    expect(ownTrackedDoorbellRows(undefined, undefined)).toBeNull();
    expect(
      ownTrackedDoorbellRows(
        [tracked(101, 5_000), tracked(202, 6_000), tracked(303, 7_000)],
        [101, 303],
      ),
    ).toEqual([tracked(101, 5_000), tracked(303, 7_000)]);
    expect(ownTrackedDoorbellRows([tracked(101, 5_000)], [])).toEqual([]);

    const ring = vi.fn(async () => response('processed'));
    const memory = new Map<number, DoorbellMemoryEntry>();
    const feed = {
      tracked: [tracked(101, 5_000), tracked(202, 6_000)],
      ownTrackedCharacterIds: [101],
    };

    ringOwnDoorbells(null, feed, ring);
    ringOwnDoorbells(memory, undefined, ring);
    ringOwnDoorbells(memory, null, ring);
    expect(ring).not.toHaveBeenCalled();

    ringOwnDoorbells(memory, feed, ring);
    await vi.waitFor(() => expect(ring).toHaveBeenCalledTimes(1));
    expect(ring).toHaveBeenCalledWith(101);
  });
});

describe('pendingDoorbells', () => {
  it('rings fresh transitions once per transitionObservedAt with retry, cap, and in-flight rules', () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    expect(
      pendingDoorbells(
        [
          tracked(101, 5_000),
          tracked(202, null),
          { characterId: 303, location: null },
        ],
        memory,
      ),
    ).toEqual([{ characterId: 101, transitionObservedAt: 5_000 }]);

    const settled = new Map<number, DoorbellMemoryEntry>([
      [101, { transitionObservedAt: 5_000, attempts: 1, settled: true, inFlight: false }],
    ]);
    expect(pendingDoorbells([tracked(101, 5_000)], settled)).toEqual([]);
    expect(pendingDoorbells([tracked(101, 6_000)], settled)).toEqual([
      { characterId: 101, transitionObservedAt: 6_000 },
    ]);

    const unsettled: DoorbellMemoryEntry = {
      transitionObservedAt: 5_000,
      attempts: 2,
      settled: false,
      inFlight: false,
    };
    expect(pendingDoorbells([tracked(101, 5_000)], new Map([[101, unsettled]])))
      .toHaveLength(1);
    expect(
      pendingDoorbells(
        [tracked(101, 5_000)],
        new Map([[101, { ...unsettled, inFlight: true }]]),
      ),
    ).toEqual([]);
    expect(
      pendingDoorbells(
        [tracked(101, 5_000)],
        new Map([[101, { ...unsettled, attempts: DOORBELL_ATTEMPT_CAP }]]),
      ),
    ).toEqual([]);
  });
});

describe('ring bookkeeping', () => {
  it('counts attempts per transition, resets on a new one, and settles every answer except retry', () => {
    const first = ringDispatched(undefined, 5_000);
    expect(first.attempts).toBe(1);
    const second = ringDispatched(first, 5_000);
    expect(second.attempts).toBe(2);
    expect(ringDispatched(second, 6_000).attempts).toBe(1);

    const entry: DoorbellMemoryEntry = {
      transitionObservedAt: 5_000,
      attempts: 1,
      settled: false,
      inFlight: true,
    };
    expect(ringAnswered(entry, 5_000, 'processed').settled).toBe(true);
    expect(ringAnswered(entry, 5_000, 'skipped').settled).toBe(true);
    expect(ringAnswered(entry, 5_000, 'stale').settled).toBe(true);
    expect(ringAnswered(entry, 5_000, 'retry')).toEqual({
      ...entry,
      settled: false,
      inFlight: false,
    });
    expect(ringAnswered(entry, 5_000, null).settled).toBe(false);
    const newer = { ...entry, transitionObservedAt: 6_000 };
    expect(ringAnswered(newer, 5_000, 'processed')).toBe(newer);
  });
});

describe('ringPendingTransitions', () => {
  it('rings once per transition, retries to the cap, guards overlap, and treats throws as retryable', async () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    const ring = vi.fn(async () => response('processed'));

    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledTimes(1);
    expect(ring).toHaveBeenCalledWith(101);
    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledTimes(1);

    const retryMemory = new Map<number, DoorbellMemoryEntry>();
    const retryRing = vi.fn(async () => response('retry'));
    for (let pass = 0; pass < DOORBELL_ATTEMPT_CAP + 3; pass += 1) {
      await ringPendingTransitions(retryMemory, [tracked(101, 5_000)], retryRing);
    }
    expect(retryRing).toHaveBeenCalledTimes(DOORBELL_ATTEMPT_CAP);
    retryRing.mockImplementation(async () => response('processed'));
    await ringPendingTransitions(retryMemory, [tracked(101, 6_000)], retryRing);
    await ringPendingTransitions(retryMemory, [tracked(101, 6_000)], retryRing);
    expect(retryRing).toHaveBeenCalledTimes(DOORBELL_ATTEMPT_CAP + 1);

    const overlapMemory = new Map<number, DoorbellMemoryEntry>();

    const releases: Array<(value: JumpResolverResponse | null) => void> = [];
    const overlapRing = vi.fn(
      () =>
        new Promise<JumpResolverResponse | null>((resolve) => {
          releases.push(resolve);
        }),
    );
    const firstPass = ringPendingTransitions(overlapMemory, [tracked(101, 5_000)], overlapRing);

    const secondPass = ringPendingTransitions(overlapMemory, [tracked(101, 5_000)], overlapRing);
    for (const release of releases) {
      release(response('processed'));
    }
    await Promise.all([firstPass, secondPass]);
    expect(overlapRing).toHaveBeenCalledTimes(1);

    const failMemory = new Map<number, DoorbellMemoryEntry>();
    const failRing = vi.fn(async () => {
      throw new Error('offline');
    });
    await ringPendingTransitions(failMemory, [tracked(101, 5_000)], failRing);
    expect(failMemory.get(101)).toMatchObject({ settled: false, inFlight: false });
    await ringPendingTransitions(failMemory, [tracked(101, 5_000)], failRing);
    expect(failRing).toHaveBeenCalledTimes(2);
  });
});
