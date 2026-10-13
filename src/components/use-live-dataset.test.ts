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
  useEffectEvent: <T>(callback: T) => callback,
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
  isCurrentReadIdentity: (identity: typeof h.identity) => identity !== null && identity === h.identity,
}));

import type { z } from 'zod';
import type { EndpointContract, JsonCodec } from '@/transport/endpoint';
import { type LivePost, useLiveDataset } from './use-live-dataset';

type Rows = { rows: number; refreshing: boolean };
const endpoint = { method: 'GET', path: '/api/test' } as unknown as EndpointContract<null, { 200: JsonCodec<Rows> }> & {
  method: 'GET';
};
const postEndpoint = { method: 'POST', path: '/api/test-post' } as unknown as LivePost<z.ZodTypeAny, Rows>['endpoint'];
const neverCold = () => false;
const ok = (rows: number, refreshing = false) => ({ ok: true, data: { rows, refreshing } });
const serverError = { ok: false, kind: 'http', status: 500 };

// useState call order inside the hook: failed, attempts, now.
const setFailed = () => h.setters[0]!;
const setAttempts = () => h.setters[1]!;
// The remembered entry of the endpoint the tests read, by its memory's creation order.
const remembered = (memory = 0) => (h.memories[memory]?.get() as { response: unknown } | null)?.response ?? null;

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
    h.apiFetch.mockResolvedValue(ok(1));
    const result = useLiveDataset(endpoint, 'k', neverCold);
    expect(result).toMatchObject({ response: null, loading: true, failed: false });
    await flush();
    expect(remembered()).toEqual({ rows: 1, refreshing: false });
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
    h.apiFetch.mockResolvedValueOnce(serverError).mockResolvedValueOnce(ok(2));
    useLiveDataset(endpoint, 'k', neverCold);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(remembered()).toEqual({ rows: 2, refreshing: false });
    expect(setFailed()).not.toHaveBeenCalledWith(h.identity);
  });

  it('follows a reconcile schedule while the data stays cold, then stops', async () => {
    h.apiFetch.mockResolvedValue(ok(0));
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
    h.apiFetch.mockResolvedValueOnce(ok(0)).mockResolvedValue(ok(1));
    useLiveDataset(endpoint, 'k', (response: Rows) => response.rows === 0, [4_000, 8_000, 15_000]);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps checking back while the server says a refresh is under way, then swaps in what landed and stops', async () => {
    h.apiFetch
      .mockResolvedValueOnce(ok(0, true))
      .mockResolvedValueOnce(ok(0, true))
      .mockResolvedValue(ok(5));
    // No coldness test of its own: the server's `refreshing` alone drives the re-checks.
    useLiveDataset(endpoint);
    await flush();
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(3);
    expect(remembered()).toEqual({ rows: 5, refreshing: false });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up on a refresh that never lands once the default schedule runs out', async () => {
    h.apiFetch.mockResolvedValue(ok(0, true));
    useLiveDataset(endpoint);
    await flush();
    // 4, 8, 15, 30 and 60 s after the load: five re-checks, then nothing.
    await vi.advanceTimersByTimeAsync(117_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(6);
  });

  it('keeps loaded data when the reconcile fetch fails', async () => {
    h.apiFetch.mockResolvedValueOnce(ok(0)).mockResolvedValueOnce(serverError);
    useLiveDataset(endpoint, 'k', () => true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).not.toHaveBeenCalledWith(h.identity);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded data when a re-run for a new key fails twice', async () => {
    h.apiFetch.mockResolvedValueOnce(ok(1)).mockResolvedValue(serverError);
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
    h.apiFetch.mockResolvedValueOnce(ok(3)).mockReturnValue(new Promise(() => {}));
    useLiveDataset(endpoint, 'k', neverCold);
    await flush();
    h.setters.length = 0;
    const again = useLiveDataset(endpoint, 'k', neverCold);
    expect(again).toMatchObject({ response: { rows: 3 }, loading: false });
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('sends a POST contract its body and remembers the answer under the body key alone', async () => {
    h.apiFetch.mockResolvedValueOnce(ok(4)).mockReturnValue(new Promise(() => {}));
    useLiveDataset({ endpoint: postEndpoint, body: { typeIds: [34, 35] }, key: '34,35' });
    expect(h.apiFetch).toHaveBeenCalledWith(postEndpoint, { body: { typeIds: [34, 35] } });
    await flush();
    h.setters.length = 0;
    expect(useLiveDataset({ endpoint: postEndpoint, body: { typeIds: [34, 35] }, key: '34,35' })).toMatchObject({
      response: { rows: 4 },
      loading: false,
    });
    // Another key draws nothing until its own read lands, and a failure then still retries rather than keeping the other entry.
    h.setters.length = 0;
    h.apiFetch.mockReset().mockResolvedValue(serverError);
    expect(useLiveDataset({ endpoint: postEndpoint, body: { typeIds: [36] }, key: '36' })).toMatchObject({
      response: null,
      loading: true,
    });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).toHaveBeenCalledWith(h.identity);
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
    resolve(ok(99));
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

describe('useLiveDataset request sharing', () => {
  /** A second reader rendering after the first, as the fake React keeps one hook's state per render. */
  const renderAgain = () => {
    h.setters.length = 0;
    h.refIndex = 0;
  };
  /** Runs the effect cleanups of every reader mounted so far: an unmount. */
  const unmount = () => {
    for (const cleanup of h.cleanups.splice(0)) cleanup();
  };

  it('sends one request for two readers of one GET read mounted together, and both see its answer', async () => {
    const answer = Promise.withResolvers<unknown>();
    h.apiFetch.mockReturnValue(answer.promise);
    useLiveDataset(endpoint, 'k', neverCold);
    const firstFailed = setFailed();
    renderAgain();
    useLiveDataset(endpoint, 'k', neverCold);
    expect(h.apiFetch).toHaveBeenCalledOnce();

    answer.resolve(ok(6));
    await flush();
    expect(remembered()).toEqual({ rows: 6, refreshing: false });
    expect(firstFailed).toHaveBeenCalledWith(null);
    expect(setFailed()).toHaveBeenCalledWith(null);
  });

  it('sends one request across a StrictMode mount, unmount and mount again, and the remount takes the answer', async () => {
    const answer = Promise.withResolvers<unknown>();
    h.apiFetch.mockReturnValue(answer.promise);
    useLiveDataset(endpoint, 'k', neverCold);
    const firstFailed = setFailed();
    unmount();
    renderAgain();
    useLiveDataset(endpoint, 'k', neverCold);
    expect(h.apiFetch).toHaveBeenCalledOnce();

    answer.resolve(ok(7));
    await flush();
    expect(firstFailed).not.toHaveBeenCalled();
    expect(setFailed()).toHaveBeenCalledWith(null);
    expect(remembered()).toEqual({ rows: 7, refreshing: false });
  });

  it('sends POST reads with different keys separately', () => {
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    useLiveDataset({ endpoint: postEndpoint, body: { typeIds: [34] }, key: '34' });
    renderAgain();
    useLiveDataset({ endpoint: postEndpoint, body: { typeIds: [35] }, key: '35' });
    expect(h.apiFetch.mock.calls).toEqual([
      [postEndpoint, { body: { typeIds: [34] } }],
      [postEndpoint, { body: { typeIds: [35] } }],
    ]);
  });

  it('never joins a request sent before the cold key moved on, such as a save bumping a revision', async () => {
    const before = Promise.withResolvers<unknown>();
    h.apiFetch.mockReturnValueOnce(before.promise).mockResolvedValueOnce(ok(2));
    useLiveDataset(endpoint, 1, neverCold);
    unmount();
    renderAgain();
    useLiveDataset(endpoint, 2, neverCold);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    await flush();
    before.resolve(ok(1));
    await flush();
    expect(remembered()).toEqual({ rows: 2, refreshing: false });
  });

  it('sends a new request for a new identity rather than taking the old one\'s answer', async () => {
    const old = Promise.withResolvers<unknown>();
    h.apiFetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(8));
    useLiveDataset(endpoint, 'k', neverCold);
    h.identity = { userId: 'account-b', characterId: 7 };
    renderAgain();
    useLiveDataset(endpoint, 'k', neverCold);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    old.resolve(ok(99));
    await flush();
    expect(remembered()).toEqual({ rows: 8, refreshing: false });
  });

  it('asks again on the next check once the shared request has settled', async () => {
    h.apiFetch.mockResolvedValueOnce(ok(0, true)).mockResolvedValueOnce(ok(3));
    useLiveDataset(endpoint);
    await flush();
    expect(h.apiFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(remembered()).toEqual({ rows: 3, refreshing: false });
  });

  it('sends every reader of a shared failure through its own retry', async () => {
    const failing = Promise.withResolvers<unknown>();
    const retried = Promise.withResolvers<unknown>();
    h.apiFetch.mockReturnValueOnce(failing.promise).mockReturnValueOnce(retried.promise);
    useLiveDataset(endpoint, 'k', neverCold);
    const firstFailed = setFailed();
    renderAgain();
    useLiveDataset(endpoint, 'k', neverCold);
    failing.resolve(serverError);
    await flush();
    // Both readers retry after the delay, and their retries share one request too.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    retried.resolve(serverError);
    await flush();
    expect(firstFailed).toHaveBeenCalledWith(h.identity);
    expect(setFailed()).toHaveBeenCalledWith(h.identity);
  });
});
