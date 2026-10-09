import { expect, test, vi } from 'vitest';
import type { MarketHistoryInputs } from './types';

const h = vi.hoisted(() => ({
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  cleanups: [] as Array<() => void>,
  apiFetch: vi.fn(),
}));

vi.mock('react', () => ({
  useState: <T>(init: T | (() => T)) => {
    const setter = vi.fn();
    h.setters.push(setter);
    return [typeof init === 'function' ? (init as () => T)() : init, setter];
  },
  useRef: <T>(current: T) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

import { useRefreshHistoryOnView } from './use-refresh-on-view';

const inputsFor = (typeId: number): MarketHistoryInputs => ({
  typeId,
  averageDailyVolume: [{ days: 7, adv: typeId }],
  volumeCv: null,
  priceVolatility: null,
  daysCovered: 1,
  latestDate: '2026-09-26',
});

function freshMount() {
  h.setters.length = 0;
  h.cleanups.length = 0;
  h.apiFetch.mockClear();
}

function mounted() {
  const [setInputs, setRefreshing] = h.setters;
  return { setInputs: setInputs!, setRefreshing: setRefreshing!, unmount: () => h.cleanups.forEach((c) => c()) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('refreshes unique type ids once enabled and publishes the fetched inputs', async () => {
  freshMount();
  expect(useRefreshHistoryOnView([34], { enabled: false })).toEqual({ inputs: new Map(), refreshing: false });
  const idle = mounted();
  freshMount();
  useRefreshHistoryOnView([], { enabled: true });
  const empty = mounted();
  await settle();
  expect(h.apiFetch).not.toHaveBeenCalled();
  expect(idle.setRefreshing).not.toHaveBeenCalled();
  expect(empty.setRefreshing).not.toHaveBeenCalled();

  const onResult = vi.fn();
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { inputs: [inputsFor(34), inputsFor(35)] } });
  freshMount();
  useRefreshHistoryOnView([34, 34, 35], { enabled: true, onResult });
  const live = mounted();
  expect(live.setRefreshing).toHaveBeenLastCalledWith(true);
  const [, init] = h.apiFetch.mock.calls[0]!;
  expect(init).toMatchObject({ body: { typeIds: [34, 35] }, cache: 'no-store' });
  await settle();
  const published = new Map([[34, inputsFor(34)], [35, inputsFor(35)]]);
  expect(live.setInputs).toHaveBeenCalledWith(published);
  expect(onResult).toHaveBeenCalledWith(published);
  expect(live.setRefreshing).toHaveBeenLastCalledWith(false);
});

test('keeps prior inputs on refused or unreachable refreshes and goes quiet once unmounted', async () => {
  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'api', status: 429, error: {} });
  freshMount();
  useRefreshHistoryOnView([34], { enabled: true });
  const refused = mounted();
  await settle();
  expect(refused.setInputs).not.toHaveBeenCalled();
  expect(refused.setRefreshing.mock.calls).toEqual([[true], [false]]);

  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') });
  freshMount();
  useRefreshHistoryOnView([34], { enabled: true });
  const offline = mounted();
  await settle();
  expect(offline.setInputs).not.toHaveBeenCalled();
  expect(offline.setRefreshing.mock.calls).toEqual([[true], [false]]);

  let resolve: (value: unknown) => void = () => {};
  h.apiFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const onResult = vi.fn();
  freshMount();
  useRefreshHistoryOnView([34], { enabled: true, onResult });
  const leaving = mounted();
  const [, init] = h.apiFetch.mock.calls[0]!;
  leaving.unmount();
  expect((init as { signal: AbortSignal }).signal.aborted).toBe(true);
  resolve({ ok: true, data: { inputs: [inputsFor(34)] } });
  await settle();
  expect(leaving.setInputs).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
  expect(leaving.setRefreshing.mock.calls).toEqual([[true]]);
});
