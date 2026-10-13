import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import type { MarketHistoryInputs } from './types';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
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
  rt.unmount();
  h.apiFetch.mockReset();
}

const view = (typeIds: number[], enabled: boolean, onResult: (inputs: Map<number, MarketHistoryInputs>) => void) =>
  rt.render(useRefreshHistoryOnView, typeIds, { enabled, onResult });

test('refreshes unique type ids once enabled, keeps the run as ids change, and publishes to the latest callback', async () => {
  freshMount();
  const idle = vi.fn();
  view([34], false, idle);
  view([], true, idle);
  await settle();
  expect(h.apiFetch).not.toHaveBeenCalled();
  expect(idle).not.toHaveBeenCalled();

  freshMount();
  let resolve: (value: unknown) => void = () => {};
  h.apiFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const first = vi.fn();
  view([34, 34, 35], true, first);
  const [, init] = h.apiFetch.mock.calls[0]!;
  expect(init).toMatchObject({ body: { typeIds: [34, 35] }, cache: 'no-store' });

  // A new id list and callback while the read is out start no second read.
  const latest = vi.fn();
  view([36], true, latest);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  resolve({ ok: true, data: { inputs: [inputsFor(34), inputsFor(35)] } });
  await settle();
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledExactlyOnceWith(new Map([[34, inputsFor(34)], [35, inputsFor(35)]]));
});

test('publishes nothing on refused or unreachable refreshes, or once unmounted', async () => {
  freshMount();
  const refused = vi.fn();
  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'api', status: 429, error: {} });
  view([34], true, refused);
  await settle();
  expect(h.apiFetch).toHaveBeenCalledOnce();
  expect(refused).not.toHaveBeenCalled();

  freshMount();
  const offline = vi.fn();
  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') });
  view([34], true, offline);
  await settle();
  expect(h.apiFetch).toHaveBeenCalledOnce();
  expect(offline).not.toHaveBeenCalled();

  freshMount();
  let resolve: (value: unknown) => void = () => {};
  h.apiFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const leaving = vi.fn();
  view([34], true, leaving);
  const [, init] = h.apiFetch.mock.calls[0]!;
  rt.unmount();
  expect((init as { signal: AbortSignal }).signal.aborted).toBe(true);
  resolve({ ok: true, data: { inputs: [inputsFor(34)] } });
  await settle();
  expect(leaving).not.toHaveBeenCalled();
});
