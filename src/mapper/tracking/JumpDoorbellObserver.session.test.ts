import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  tracking: undefined as unknown,
  userId: undefined as unknown,
  postJumpRequest: vi.fn(),
}));

vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useEffectEvent: <T>(fn: T) => fn,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));
vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (_query: unknown, args?: unknown) => (args === undefined ? h.userId : h.tracking),
}));
vi.mock('../jump-client', () => ({ postJumpRequest: h.postJumpRequest }));

import { DOORBELL_CHANNEL_PREFIX } from './doorbell-model';
import { JumpDoorbellObserver } from './JumpDoorbellObserver';

afterEach(() => {
  h.cleanups.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tracking = {
  tracked: [
    { characterId: 7, location: { transitionObservedAt: 1_000 } },
    { characterId: 8, location: { transitionObservedAt: 2_000 } },
    { characterId: 9, location: { transitionObservedAt: 3_000 } },
  ],
  ownTrackedCharacterIds: [7, 8],
};

function fakeStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => items.set(key, value)),
  };
}

function mount(mapId = 'map-a') {
  h.cleanups.length = 0;
  JumpDoorbellObserver({ mapId });
  return () => h.cleanups.forEach((cleanup) => cleanup());
}

test('rings unsettled own transitions from session memory and stops once unmounted', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('BroadcastChannel', undefined);
  const storageKey = JSON.stringify([DOORBELL_CHANNEL_PREFIX, JSON.stringify(['user-1', 'map-a'])]);
  const storage = fakeStorage({
    [storageKey]: JSON.stringify({
      8: { transitionObservedAt: 2_000, attempts: 1, settled: true, inFlight: false },
    }),
  });
  vi.stubGlobal('window', { sessionStorage: storage });
  h.postJumpRequest.mockReset().mockResolvedValue({ status: 'processed', outcome: 'authored', emitted: true });
  h.tracking = tracking;

  // No signed-in user yet: there is no session to ring from.
  h.userId = undefined;
  const signedOut = mount();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(h.postJumpRequest).not.toHaveBeenCalled();
  signedOut();

  h.userId = 'user-1';
  const unmount = mount();
  await vi.advanceTimersByTimeAsync(0);
  // Character 8 was already settled in this tab's memory; 9 is someone else's.
  expect(h.postJumpRequest.mock.calls).toEqual([[{ kind: 'doorbell', mapId: 'map-a', characterId: 7 }]]);
  const saved = JSON.parse(storage.items.get(storageKey) ?? '{}') as Record<string, { settled: boolean }>;
  expect(saved[7]?.settled).toBe(true);

  // Settled transitions are not rung again by the retry interval.
  await vi.advanceTimersByTimeAsync(15_000);
  expect(h.postJumpRequest).toHaveBeenCalledTimes(1);

  const writes = storage.setItem.mock.calls.length;
  unmount();
  expect(storage.setItem).toHaveBeenCalledTimes(writes + 1);
  h.tracking = { ...tracking, tracked: [{ characterId: 7, location: { transitionObservedAt: 5_000 } }] };
  await vi.advanceTimersByTimeAsync(15_000);
  expect(h.postJumpRequest).toHaveBeenCalledTimes(1);
});

test('waits to join the tab channel before ringing, shares the result, and closes on unmount', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    get sessionStorage(): Storage {
      throw new Error('storage blocked');
    },
  });
  const channels: Array<{ name: string; postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null;
      onmessageerror = null;
      readonly postMessage = vi.fn();
      readonly close = vi.fn();
      constructor(readonly name: string) {
        channels.push(this);
      }
    },
  );
  h.postJumpRequest.mockReset().mockResolvedValue({ status: 'retry', reason: 'busy' });
  h.tracking = tracking;
  h.userId = 'user-2';

  const unmount = mount('map-b');
  expect(channels).toHaveLength(1);
  expect(channels[0]?.name).toBe(JSON.stringify([DOORBELL_CHANNEL_PREFIX, 'user-2']));
  expect(h.postJumpRequest).not.toHaveBeenCalled();

  // No other tab answers the join request, so the tab starts ringing on its own.
  await vi.advanceTimersByTimeAsync(100);
  expect(h.postJumpRequest.mock.calls).toEqual([
    [{ kind: 'doorbell', mapId: 'map-b', characterId: 7 }],
    [{ kind: 'doorbell', mapId: 'map-b', characterId: 8 }],
  ]);
  const shared = channels[0]!.postMessage.mock.calls.map(([message]) => message as { requestSnapshot: boolean });
  expect(shared.map((message) => message.requestSnapshot)).toEqual([true, false, false]);

  unmount();
  expect(channels[0]?.close).toHaveBeenCalledTimes(1);
});
