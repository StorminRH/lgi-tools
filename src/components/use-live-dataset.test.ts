import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cleanups: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  state: [] as unknown[],
}));

vi.mock('react', () => ({
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
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));

import { useLiveDataset } from './use-live-dataset';

const endpoint = { method: 'GET', path: '/api/test' } as unknown as Parameters<
  typeof useLiveDataset<{ rows: number }, string>
>[0];
const neverCold = () => false;
const ok = (data: unknown) => ({ ok: true, data });
const serverError = { ok: false, kind: 'http', status: 500 };

// useState call order inside the hook: response, failed, now.
const setResponse = () => h.setters[0]!;
const setFailed = () => h.setters[1]!;

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  h.cleanups.length = 0;
  h.refs.length = 0;
  h.refIndex = 0;
  h.setters.length = 0;
  h.state.length = 0;
});

afterEach(() => {
  for (const cleanup of h.cleanups) cleanup();
  vi.useRealTimers();
});

describe('useLiveDataset', () => {
  it('is loading until the first response arrives', () => {
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    const result = useLiveDataset(endpoint, 'k', neverCold);
    expect(result).toMatchObject({ response: null, loading: true, failed: false });
  });

  it('stores a successful response and clears any earlier failure', async () => {
    h.apiFetch.mockResolvedValue(ok({ rows: 1 }));
    useLiveDataset(endpoint, 'k', neverCold);
    await flush();
    expect(setResponse()).toHaveBeenCalledWith({ rows: 1 });
    expect(setFailed()).toHaveBeenCalledWith(false);
  });

  it('retries a failed first load once, then settles as failed', async () => {
    h.apiFetch.mockResolvedValue(serverError);
    useLiveDataset(endpoint, 'k', neverCold);
    await flush();
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    expect(setFailed()).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).toHaveBeenCalledWith(true);
    expect(setResponse()).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry succeeds', async () => {
    h.apiFetch.mockResolvedValueOnce(serverError).mockResolvedValueOnce(ok({ rows: 2 }));
    useLiveDataset(endpoint, 'k', neverCold);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(setResponse()).toHaveBeenCalledWith({ rows: 2 });
    expect(setFailed()).not.toHaveBeenCalledWith(true);
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
    expect(setFailed()).not.toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded data when a re-run for a new key fails twice', async () => {
    h.apiFetch.mockResolvedValueOnce(ok({ rows: 1 })).mockResolvedValue(serverError);
    useLiveDataset(endpoint, 'a', neverCold);
    await flush();
    h.setters.length = 0;
    h.refIndex = 0;
    h.state.push({ rows: 1 }, false);
    useLiveDataset(endpoint, 'b', neverCold);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(setFailed()).not.toHaveBeenCalledWith(true);
  });

  it('reports failed and not loading once the failure has settled', () => {
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    h.state.push(null, true);
    const result = useLiveDataset(endpoint, 'k', neverCold);
    expect(result).toMatchObject({ response: null, loading: false, failed: true });
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
});
