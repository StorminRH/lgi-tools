import { describe, expect, it, vi } from 'vitest';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import {
  DOORBELL_ATTEMPT_CAP,
  pendingDoorbells,
  ringAnswered,
  ringDispatched,
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

describe('pendingDoorbells', () => {
  it('rings a fresh transition and never an untracked or transitionless row', () => {
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
  });

  it('keys the ring-once memory on transitionObservedAt, not on payload churn', () => {
    // A dock/undock advances observedAt but not transitionObservedAt: the
    // settled entry must keep the doorbell silent across those updates.
    const memory = new Map<number, DoorbellMemoryEntry>([
      [101, { transitionObservedAt: 5_000, attempts: 1, settled: true, inFlight: false }],
    ]);
    expect(pendingDoorbells([tracked(101, 5_000)], memory)).toEqual([]);
    // A genuine new transition rings again.
    expect(pendingDoorbells([tracked(101, 6_000)], memory)).toEqual([
      { characterId: 101, transitionObservedAt: 6_000 },
    ]);
  });

  it('retries an unsettled transition until the attempt cap, never while in flight', () => {
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
  it('counts attempts per transition and resets them on a new transition', () => {
    const first = ringDispatched(undefined, 5_000);
    expect(first.attempts).toBe(1);
    const second = ringDispatched(first, 5_000);
    expect(second.attempts).toBe(2);
    const fresh = ringDispatched(second, 6_000);
    expect(fresh.attempts).toBe(1);
  });

  it('settles every workflow answer except retry, and ignores stale answers', () => {
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
    // An answer for a superseded transition leaves the newer entry untouched.
    const newer = { ...entry, transitionObservedAt: 6_000 };
    expect(ringAnswered(newer, 5_000, 'processed')).toBe(newer);
  });
});

describe('ringPendingTransitions', () => {
  it('rings once per transition and stays silent once settled', async () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    const ring = vi.fn(async () => response('processed'));

    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledTimes(1);
    expect(ring).toHaveBeenCalledWith(101);

    // The same payload again (and a dock-style churn) rings nothing.
    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledTimes(1);
  });

  it('retries while the route answers retry, bounded by the attempt cap', async () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    const ring = vi.fn(async () => response('retry'));

    for (let pass = 0; pass < DOORBELL_ATTEMPT_CAP + 3; pass += 1) {
      await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    }
    expect(ring).toHaveBeenCalledTimes(DOORBELL_ATTEMPT_CAP);

    // A processed answer for the next transition settles it in one ring.
    ring.mockImplementation(async () => response('processed'));
    await ringPendingTransitions(memory, [tracked(101, 6_000)], ring);
    await ringPendingTransitions(memory, [tracked(101, 6_000)], ring);
    expect(ring).toHaveBeenCalledTimes(DOORBELL_ATTEMPT_CAP + 1);
  });

  it('marks memory before awaiting so an overlapping pass cannot double-ring', async () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    let release: (value: JumpResolverResponse) => void = () => undefined;
    const ring = vi.fn(
      () =>
        new Promise<JumpResolverResponse | null>((resolve) => {
          release = resolve;
        }),
    );

    const firstPass = ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    // The double-invoked development effect re-enters before any response.
    const secondPass = ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    release(response('processed'));
    await Promise.all([firstPass, secondPass]);
    expect(ring).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown transport failure as an unsettled retryable attempt', async () => {
    const memory = new Map<number, DoorbellMemoryEntry>();
    const ring = vi.fn(async () => {
      throw new Error('offline');
    });
    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(memory.get(101)).toMatchObject({ settled: false, inFlight: false });
    await ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledTimes(2);
  });
});
