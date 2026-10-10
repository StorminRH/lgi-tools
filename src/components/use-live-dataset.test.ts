import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  identity: { userId: 'account-a', characterId: 7 } as { userId: string; characterId: number } | null,
  cleanups: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  state: [] as unknown[],
  memories: [] as Array<{ value: unknown; get: () => unknown; set: (next: unknown) => void }>,
}));

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
  useRef: <T>(initial: T) => {
    const index = h.refIndex++;
    h.refs[index] ??= { current: initial };
    return h.refs[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = h.setters.length;
    const value =
      index < h.state.length
        ? h.state[index]
        : typeof initial === 'function'
          ? (initial as () => T)()
          : initial;
    const setter = vi.fn();
    h.setters.push(setter);
    return [value, setter];
  },
}));
// A plain remembered store: what the hook last read, readable between renders.
vi.mock('./remembered-read', () => ({
  createRememberedRead: () => {
    const memory = {
      value: null as unknown,
      get: () => memory.value,
      set: (next: unknown) => {
        memory.value = next;
      },
    };
    h.memories.push(memory);
    return memory;
  },
  useRememberedRead: (memory: { get: () => unknown }) => memory.get(),
}));
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock('@/platform/auth/read-identity', () => ({
  useReadIdentity: () => h.identity,
  currentReadIdentity: () => h.identity,
}));

import { useLiveDataset } from './use-live-dataset';

const endpoint = { method: 'GET', path: '/api/test' } as unknown as Parameters<
  typeof useLiveDataset<{ rows: number }, string>
>[0];
const neverCold = () => false;
const ok = (data: unknown) => ({ ok: true, data });
const serverError = { ok: false, kind: 'http', status: 500 };

// useState call order inside the hook: failed, attempts, now.
const setFailed = () => h.setters[0]!;
const setAttempts = () => h.setters[1]!;
// The one endpoint the tests read, so the one memory the hook keeps.
const remembered = () => h.memories[0]?.get() ?? null;

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  h.identity = { userId: 'account-a', characterId: 7 };
  h.cleanups.length = 0;
  h.refs.length = 0;
  h.refIndex = 0;
  h.setters.length = 0;
  h.state.length = 0;
  for (const memory of h.memories) memory.set(null);
});

afterEach(() => {
  for (const cleanup of h.cleanups) cleanup();
  vi.useRealTimers();
});

describe('useLiveDataset', () => {
  it('is loading until the first response arrives, then stores it and clears any earlier failure', async () => {
    h.apiFetch.mockResolvedValue(ok({ rows: 1 }));
    const result = useLiveDataset(endpoint, 'k', neverCold);
    expect(result).toMatchObject({ response: null, loading: true, failed: false });
    await flush();
    expect(remembered()).toEqual({ rows: 1 });
    expect(setFailed()).toHaveBeenCalledWith(null);
  });

  it('retries a failed first load once, then settles as failed', async () => {
    h.apiFetch.mockResolvedValue(serverError);
    useLiveDataset(endpoint, 'k', neverCold);
    await flush();
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    expect(setFailed()).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).toHaveBeenCalledWith(h.identity);
    expect(remembered()).toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);

    // Rendered again with that failure settled, the hook reports failed and not loading.
    h.setters.length = 0;
    h.refIndex = 0;
    h.state.push(h.identity);
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    expect(useLiveDataset(endpoint, 'k', neverCold)).toMatchObject({ response: null, loading: false, failed: true });
  });

  it('recovers when the retry succeeds', async () => {
    h.apiFetch.mockResolvedValueOnce(serverError).mockResolvedValueOnce(ok({ rows: 2 }));
    useLiveDataset(endpoint, 'k', neverCold);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(remembered()).toEqual({ rows: 2 });
    expect(setFailed()).not.toHaveBeenCalledWith(h.identity);
  });

  it('follows a reconcile schedule while the data stays cold, then stops', async () => {
    h.apiFetch.mockResolvedValue(ok({ rows: 0 }));
    useLiveDataset(endpoint, 'k', () => true, [4_000, 8_000]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(3);
  });

  it('stops the schedule as soon as the data is warm', async () => {
    h.apiFetch.mockResolvedValueOnce(ok({ rows: 0 })).mockResolvedValue(ok({ rows: 1 }));
    useLiveDataset(endpoint, 'k', (response: { rows: number }) => response.rows === 0, [4_000, 8_000, 15_000]);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded data when the reconcile fetch fails', async () => {
    h.apiFetch.mockResolvedValueOnce(ok({ rows: 0 })).mockResolvedValueOnce(serverError);
    useLiveDataset(endpoint, 'k', () => true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).not.toHaveBeenCalledWith(h.identity);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded data when a re-run for a new key fails twice', async () => {
    h.apiFetch.mockResolvedValueOnce(ok({ rows: 1 })).mockResolvedValue(serverError);
    useLiveDataset(endpoint, 'a', neverCold);
    await flush();
    h.setters.length = 0;
    h.refIndex = 0;
    useLiveDataset(endpoint, 'b', neverCold);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).not.toHaveBeenCalledWith(h.identity);
  });

  it('draws the last response at once when it mounts again', async () => {
    h.apiFetch.mockResolvedValueOnce(ok({ rows: 3 })).mockReturnValue(new Promise(() => {}));
    useLiveDataset(endpoint, 'k', neverCold);
    await flush();
    h.setters.length = 0;
    const again = useLiveDataset(endpoint, 'k', neverCold);
    expect(again).toMatchObject({ response: { rows: 3 }, loading: false });
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a response that lands after unmount', async () => {
    let resolve!: (value: unknown) => void;
    h.apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    useLiveDataset(endpoint, 'k', neverCold);
    h.cleanups[0]!();
    resolve(serverError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    expect(setFailed()).not.toHaveBeenCalled();
  });

  it('starts the read over when asked to retry', () => {
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    const { retry } = useLiveDataset(endpoint, 'k', neverCold);
    retry();
    expect(setFailed()).toHaveBeenLastCalledWith(null);
    const bump = setAttempts().mock.calls.at(-1)?.[0] as (n: number) => number;
    expect(bump(2)).toBe(3);
  });

  it('discards an old identity response before effect cleanup runs', async () => {
    let resolve!: (value: unknown) => void;
    h.apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    useLiveDataset(endpoint, 'k', neverCold);
    h.identity = { userId: 'account-b', characterId: 7 };
    resolve(ok({ rows: 99 }));
    await flush();
    expect(remembered()).toBeNull();
    expect(setFailed()).not.toHaveBeenCalled();
  });

  it('does not read a private endpoint before the identity is known', () => {
    h.identity = null;
    useLiveDataset(endpoint, 'k', neverCold);
    expect(h.apiFetch).not.toHaveBeenCalled();
  });
});
