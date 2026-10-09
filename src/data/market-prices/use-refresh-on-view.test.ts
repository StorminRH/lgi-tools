import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cleanups: [] as Array<() => void>,
  stateSetters: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('react', () => ({
  useCallback: <T>(callback: T): T => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initial: T | (() => T)) => {
    const setter = vi.fn();
    h.stateSetters.push(setter);
    return [typeof initial === 'function' ? (initial as () => T)() : initial, setter];
  },
}));
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));

import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import { useRefreshOnView } from './use-refresh-on-view';

beforeEach(() => {
  h.apiFetch.mockReset();
  h.cleanups.length = 0;
  h.stateSetters.length = 0;
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

  it('keeps fresh prices for the next mount and refreshes only the stale ones', async () => {
    const price = (typeId: number, staleAfter: string) => ({
      typeId,
      bestBuy: 10,
      bestSell: 12,
      pct5Buy: null,
      pct5Sell: null,
      buyVolume: null,
      sellVolume: null,
      buyDepth: null,
      sellDepth: null,
      regionalDiscount: null,
      source: 'esi',
      staleAfter,
    });
    const later = new Date(Date.now() + 5 * 60_000).toISOString();
    const earlier = new Date(Date.now() - 60_000).toISOString();
    h.apiFetch.mockResolvedValueOnce({
      ok: true,
      data: { prices: [price(910001, later), price(910002, earlier)] },
    });
    useRefreshOnView([910001, 910002], { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.apiFetch).toHaveBeenCalledTimes(1);

    // Mounting again draws the fresh price at once and asks only for the stale one.
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    const onBatch = vi.fn();
    useRefreshOnView([910001, 910002], { enabled: true, onBatch });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...(onBatch.mock.calls[0]?.[0] as Map<number, unknown>).keys()]).toEqual([910001]);
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(h.apiFetch.mock.calls[1]?.[1]?.body).toEqual({ typeIds: [910002] });

    // With everything fresh there is nothing to ask for.
    useRefreshOnView([910001], { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.apiFetch).toHaveBeenCalledTimes(2);
    expect(h.stateSetters.at(-2)).toHaveBeenCalledWith(new Set());
    expect(h.stateSetters.at(-1)).toHaveBeenCalledWith(false);
  });

  it('requests a price again on a view at the five-minute expiry', async () => {
    const now = Date.now();
    h.apiFetch.mockResolvedValueOnce({ ok: true, data: { prices: [{
      typeId: 910003, bestBuy: 10, bestSell: 12, pct5Buy: null, pct5Sell: null,
      buyVolume: null, sellVolume: null, buyDepth: null, sellDepth: null,
      regionalDiscount: null, source: 'esi', staleAfter: new Date(now + 300_000).toISOString(),
    }] } });
    useRefreshOnView([910003], { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.apiFetch.mockReturnValue(new Promise(() => {}));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 299_999);
    try {
      useRefreshOnView([910003], { enabled: true });
      expect(h.apiFetch).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(now + 300_000);
      useRefreshOnView([910003], { enabled: true });
      expect(h.apiFetch).toHaveBeenCalledTimes(2);
      expect(h.apiFetch.mock.calls[1]?.[1]?.body).toEqual({ typeIds: [910003] });
    } finally {
      clock.mockRestore();
    }
  });

});
