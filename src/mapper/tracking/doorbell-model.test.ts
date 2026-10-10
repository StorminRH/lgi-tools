import { describe, expect, it, vi } from 'vitest';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import { type BroadcastBus, createBroadcastBus } from '@/lib/__tests__/broadcast-bus';
import {
  DOORBELL_ATTEMPT_CAP,
  DOORBELL_CHANNEL_PREFIX,
  DOORBELL_RETRY_INTERVAL_MS,
  hydrateDoorbellMemory,
  joinDoorbellChannel,
  ownTrackedDoorbellRows,
  pendingDoorbells,
  persistDoorbellMemory,
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
        new Map([[101, { ...unsettled, inFlight: true, lease: { id: 'active', expiresAt: Date.now() + 15_000 } }]]),
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

class MemoryStorage {
  readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const settled: DoorbellMemoryEntry = {
  transitionObservedAt: 5_000,
  attempts: 1,
  settled: true,
  inFlight: false,
};

const inFlight: DoorbellMemoryEntry = {
  transitionObservedAt: 5_000,
  attempts: 1,
  settled: false,
  inFlight: true,
  lease: { id: 'remote', expiresAt: 20_000 },
};

describe('doorbell remount memory', () => {
    it('hydrates settled memory per map, isolates map B, and ignores missing or corrupt snapshots', () => {
    const storage = new MemoryStorage();
    persistDoorbellMemory(
      storage,
      'map-a',
      new Map<number, DoorbellMemoryEntry>([[101, settled]]),
    );

    const remounted = hydrateDoorbellMemory(storage, 'map-a');
    expect(pendingDoorbells([tracked(101, 5_000)], remounted)).toEqual([]);
    expect(hydrateDoorbellMemory(storage, 'map-missing').size).toBe(0);
    storage.setItem(JSON.stringify([DOORBELL_CHANNEL_PREFIX, 'map-bad']), '{');
    expect(hydrateDoorbellMemory(storage, 'map-bad').size).toBe(0);

    const mapB = hydrateDoorbellMemory(storage, 'map-b');
    expect(pendingDoorbells([tracked(101, 5_000)], mapB)).toEqual([
      { characterId: 101, transitionObservedAt: 5_000 },
    ]);

    persistDoorbellMemory(
      storage,
      'map-b',
      new Map<number, DoorbellMemoryEntry>([[202, inFlight]]),
    );
    const restoredA = hydrateDoorbellMemory(storage, 'map-a');
    expect(pendingDoorbells([tracked(101, 5_000)], restoredA)).toEqual([]);
    expect(restoredA.get(202)).toBeUndefined();
  });
});

describe('doorbell tab memory', () => {
  it('shares two-tab in-flight memory on the doorbell channel', () => {
    const bus = createBroadcastBus();
    const firstMemory = new Map<number, DoorbellMemoryEntry>();
    const secondMemory = new Map<number, DoorbellMemoryEntry>();
    const first = joinDoorbellChannel({
      userId: 'user-a',
      mapId: 'map-a',
      tabId: 'tab-a',
      memory: firstMemory,
      openChannel: bus.open,
      persist: () => undefined,
    });
    const second = joinDoorbellChannel({
      userId: 'user-a',
      mapId: 'map-a',
      tabId: 'tab-b',
      memory: secondMemory,
      openChannel: bus.open,
      persist: () => undefined,
    });

    expect(bus.channels[0]?.name).toBe(JSON.stringify(['lgi-atlas-doorbell-v1', 'user-a']));

    firstMemory.set(101, inFlight);
    first.share();
    bus.flush();
    expect(pendingDoorbells([tracked(101, 5_000)], secondMemory, 10_000)).toEqual([]);
    expect(secondMemory.get(101)).toMatchObject({ inFlight: true, settled: false });

    second.close();
    first.close();
  });
});

describe('doorbell recovery', () => {
  it('retries a remounted or abandoned lease after its deadline and recovers legacy snapshots', async () => {
    const storage = new MemoryStorage();
    const expiresAt = Date.now() + DOORBELL_RETRY_INTERVAL_MS;
    const memory = new Map<number, DoorbellMemoryEntry>([[101, {
      ...inFlight, lease: { id: 'abandoned', expiresAt },
    }]]);
    persistDoorbellMemory(storage, 'map-a', memory);
    const remounted = hydrateDoorbellMemory(storage, 'map-a');
    expect(pendingDoorbells([tracked(101, 5_000)], remounted, expiresAt - 1)).toEqual([]);
    expect(pendingDoorbells([tracked(101, 5_000)], remounted, expiresAt)).toHaveLength(1);
    persistDoorbellMemory(storage, 'legacy', new Map([[101, {
      transitionObservedAt: 5_000, attempts: 1, settled: false, inFlight: true,
    }]]));
    const legacy = hydrateDoorbellMemory(storage, 'legacy');
    const ring = vi.fn(async () => response('processed'));
    await ringPendingTransitions(legacy, [tracked(101, 5_000)], ring);
    expect(ring).toHaveBeenCalledOnce();
  });

  it('does not let an expired request overwrite a newer request for the same transition', async () => {
    vi.useFakeTimers();
    try {
      const memory = new Map<number, DoorbellMemoryEntry>();
      const releases: Array<(value: JumpResolverResponse) => void> = [];
      const ring = vi.fn(() => new Promise<JumpResolverResponse>((resolve) => releases.push(resolve)));
      const first = ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
      vi.advanceTimersByTime(DOORBELL_RETRY_INTERVAL_MS);
      const second = ringPendingTransitions(memory, [tracked(101, 5_000)], ring);
      const newer = memory.get(101);
      releases[0]?.(response('retry'));
      await first;
      expect(memory.get(101)).toBe(newer);
      expect(newer?.inFlight).toBe(true);
      releases[1]?.(response('processed'));
      await second;
      expect(memory.get(101)).toMatchObject({ settled: true, inFlight: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('doorbell snapshot handshake', () => {
  function join(bus: BroadcastBus, tabId: string, memory: Map<number, DoorbellMemoryEntry>) {
    return joinDoorbellChannel({
      userId: 'user-a', mapId: 'map-a', tabId, memory,
      openChannel: bus.open, persist: () => undefined,
    });
  }

  it.each(['settled', 'in-flight'] as const)('learns existing %s state before a new tab rings', async (state) => {
    const bus = createBroadcastBus();
    const entry = state === 'settled' ? settled : {
      ...inFlight, lease: { id: 'owner', expiresAt: Date.now() + 15_000 },
    };
    const owner = join(bus, 'owner', new Map([[101, entry]]));
    const memory = new Map<number, DoorbellMemoryEntry>();
    const newcomer = join(bus, 'newcomer', memory);
    const ring = vi.fn(async () => response('processed'));
    const ready = newcomer.ready.then(() => ringPendingTransitions(memory, [tracked(101, 5_000)], ring));
    expect(ring).not.toHaveBeenCalled();
    bus.flush();
    await ready;
    expect(ring).not.toHaveBeenCalled();
    expect(memory.get(101)).toEqual(entry);
    owner.close(); newcomer.close();
  });

  it.each(['processed', 'retry'] as const)('clears a sibling lease when its owner answers %s', async (status) => {
    const bus = createBroadcastBus();
    const entry = { ...inFlight, lease: { id: 'owner', expiresAt: Date.now() + 15_000 } };
    const firstMemory = new Map<number, DoorbellMemoryEntry>([[101, entry]]);
    const owner = join(bus, 'owner', firstMemory);
    const memory = new Map<number, DoorbellMemoryEntry>();
    const newcomer = join(bus, 'newcomer', memory);
    bus.flush(); await newcomer.ready;
    firstMemory.set(101, ringAnswered(entry, 5_000, status));
    owner.share(); bus.flush();
    expect(memory.get(101)).toMatchObject({ inFlight: false, settled: status === 'processed' });
    expect(pendingDoorbells([tracked(101, 5_000)], memory)).toHaveLength(status === 'processed' ? 0 : 1);
    owner.close(); newcomer.close();
  });

  it('continues without peers after the bounded join wait, or at once when the channel cannot open', async () => {
    vi.useFakeTimers();
    try {
      const channel = join(createBroadcastBus(), 'alone', new Map());
      const ready = vi.fn();
      void channel.ready.then(ready);
      expect(ready).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(ready).toHaveBeenCalledOnce();
      channel.close();

      const blocked = createBroadcastBus();
      blocked.unavailable = true;
      const offline = join(blocked, 'offline', new Map());
      const offlineReady = vi.fn();
      void offline.ready.then(offlineReady);
      await vi.advanceTimersByTimeAsync(0);
      expect(offlineReady).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      offline.close();
    } finally { vi.useRealTimers(); }
  });
});

describe('doorbell snapshot parsing', () => {
  it('keeps only well-formed entries and drops leases that cannot be trusted', () => {
    const storage = new MemoryStorage();
    const valid = { transitionObservedAt: 5_000, attempts: 0, settled: false, inFlight: false };
    storage.setItem(JSON.stringify([DOORBELL_CHANNEL_PREFIX, 'map-a']), JSON.stringify({
      101: valid,
      102: null,
      103: { ...valid, transitionObservedAt: '5000' },
      104: { ...valid, attempts: undefined },
      105: { ...valid, settled: 'no' },
      106: { ...valid, inFlight: 1 },
      107: { ...valid, transitionObservedAt: 0 },
      108: { ...valid, transitionObservedAt: 1.5 },
      109: { ...valid, attempts: -1 },
      110: { ...valid, attempts: 0.5 },
      111: { ...valid, inFlight: true, lease: { id: '', expiresAt: 20_000 } },
      112: { ...valid, inFlight: true, lease: { id: 'lease', expiresAt: 0 } },
      113: { ...valid, inFlight: true, lease: { id: 'lease', expiresAt: 20_000 } },
      0: valid,
      abc: valid,
    }));
    const memory = hydrateDoorbellMemory(storage, 'map-a');
    expect([...memory.keys()].sort()).toEqual([101, 111, 112, 113]);
    expect(memory.get(101)).toEqual(valid);
    expect(memory.get(111)).toEqual({ ...valid, inFlight: false });
    expect(memory.get(112)).toEqual({ ...valid, inFlight: false });
    expect(memory.get(113)).toEqual({ ...valid, inFlight: true, lease: { id: 'lease', expiresAt: 20_000 } });

    storage.setItem(JSON.stringify([DOORBELL_CHANNEL_PREFIX, 'map-array']), '[]');
    expect(hydrateDoorbellMemory(storage, 'map-array').size).toBe(0);
  });
});

describe('doorbell channel messages', () => {
  function listen(memory = new Map<number, DoorbellMemoryEntry>()) {
    const bus = createBroadcastBus();
    const persist = vi.fn();
    const handle = joinDoorbellChannel({
      userId: 'user-a', mapId: 'map-a', tabId: 'tab-a', memory,
      openChannel: bus.open, persist,
    });
    const channel = bus.channels[0];
    if (channel === undefined) throw new Error('channel not opened');
    return { bus, channel, handle, memory, persist };
  }

  it('ignores malformed, own-tab, and other-map messages', () => {
    const { channel, handle, memory, persist } = listen();
    const entries = { 101: settled };
    for (const data of [
      null,
      'message',
      { mapId: 'map-a', entries },
      { tabId: '', mapId: 'map-a', entries },
      { tabId: 'tab-b', entries },
      { tabId: 'tab-b', mapId: '', entries },
      { tabId: 'tab-b', mapId: 'map-a' },
      { tabId: 'tab-b', mapId: 'map-a', entries: null },
      { tabId: 'tab-b', mapId: 'map-a', entries: [] },
      { tabId: 'tab-b', mapId: 'map-a', entries: 'entries' },
      { tabId: 'tab-a', mapId: 'map-a', entries },
      { tabId: 'tab-b', mapId: 'map-b', entries },
    ]) {
      channel.deliver(data);
    }
    expect(memory.size).toBe(0);
    expect(persist).not.toHaveBeenCalled();
    channel.deliver({ tabId: 'tab-b', mapId: 'map-a', entries });
    expect(memory.get(101)).toEqual(settled);
    expect(persist).toHaveBeenCalledOnce();
    handle.close();
  });

  it('answers a snapshot request with its own memory', () => {
    const { bus, channel, handle } = listen(new Map([[101, settled]]));
    const peer = bus.open(channel.name);
    const received = vi.fn();
    peer.onmessage = (event) => received(event.data);
    channel.deliver({ tabId: 'tab-b', mapId: 'map-a', entries: {}, requestSnapshot: true });
    bus.flush();
    expect(received).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'tab-a', entries: { 101: settled },
    }));
    handle.close();
  });

  it('merges peer entries by transition, attempts, lease, and settlement', () => {
    const base = { settled: false, inFlight: true };
    const lease = (id: string, expiresAt: number) => ({ lease: { id, expiresAt } });
    const { channel, handle, memory } = listen(new Map<number, DoorbellMemoryEntry>([
      [1, { ...base, transitionObservedAt: 6_000, attempts: 1, ...lease('a', 20_000) }],
      [2, { ...base, transitionObservedAt: 5_000, attempts: 1, ...lease('a', 20_000) }],
      [3, { ...base, transitionObservedAt: 5_000, attempts: 3, ...lease('a', 20_000) }],
      [4, { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('a', 20_000) }],
      [5, { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('a', 30_000) }],
      [6, { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('a', 20_000) }],
      [7, { ...base, transitionObservedAt: 5_000, attempts: 2, settled: true, inFlight: false }],
    ]));
    channel.deliver({ tabId: 'tab-b', mapId: 'map-a', entries: {
      1: { ...base, transitionObservedAt: 5_000, attempts: 4, ...lease('b', 40_000) },
      2: { ...base, transitionObservedAt: 7_000, attempts: 1, ...lease('b', 40_000) },
      3: { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('b', 40_000) },
      4: { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('b', 40_000) },
      5: { ...base, transitionObservedAt: 5_000, attempts: 2, ...lease('b', 10_000) },
      6: { transitionObservedAt: 5_000, attempts: 2, settled: false, inFlight: false, ...lease('a', 20_000) },
      7: { ...base, transitionObservedAt: 5_000, attempts: 3, ...lease('b', 40_000) },
      8: { ...base, transitionObservedAt: 5_000, attempts: 1, ...lease('b', 40_000) },
    } });
    expect(memory.get(1)).toMatchObject({ transitionObservedAt: 6_000, lease: { id: 'a' } });
    expect(memory.get(2)).toMatchObject({ transitionObservedAt: 7_000, lease: { id: 'b' } });
    expect(memory.get(3)).toMatchObject({ attempts: 3, inFlight: true, lease: { id: 'a' } });
    expect(memory.get(4)).toMatchObject({ attempts: 2, inFlight: true, lease: { id: 'b' } });
    expect(memory.get(5)).toMatchObject({ inFlight: true, lease: { id: 'a', expiresAt: 30_000 } });
    expect(memory.get(6)).toMatchObject({ inFlight: false, settled: false });
    expect(memory.get(7)).toMatchObject({ attempts: 3, settled: true, inFlight: false });
    expect(memory.get(8)).toMatchObject({ attempts: 1, inFlight: true });
    handle.close();
  });
});
