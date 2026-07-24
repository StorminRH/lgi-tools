import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cleanups: [] as Array<() => void>,
}));

vi.mock('react', () => ({
  useCallback: <T>(callback: T): T => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initial: T | (() => T)) => [
    typeof initial === 'function' ? (initial as () => T)() : initial,
    vi.fn(),
  ],
}));
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));

import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import { useRefreshOnView } from './use-refresh-on-view';

beforeEach(() => {
  h.apiFetch.mockReset();
  h.cleanups.length = 0;
});

describe('useRefreshOnView', () => {
  it('stops scheduling batches when an in-flight request is aborted on unmount', async () => {
    let resolveFirst!: (value: unknown) => void;
    h.apiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const typeIds = Array.from(
      { length: ON_DEMAND_REFRESH_MAX_TYPE_IDS + 1 },
      (_, index) => index + 1,
    );

    useRefreshOnView(typeIds, { enabled: true });

    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    const firstSignal = h.apiFetch.mock.calls[0]?.[1]?.signal as
      | AbortSignal
      | undefined;
    expect(firstSignal?.aborted).toBe(false);

    h.cleanups.at(-1)?.();
    expect(firstSignal?.aborted).toBe(true);
    resolveFirst({
      ok: false,
      kind: 'network',
      aborted: true,
      cause: new DOMException('aborted', 'AbortError'),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.apiFetch).toHaveBeenCalledTimes(1);
  });
});
