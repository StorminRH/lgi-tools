import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

/** Fresh hooks over fresh client singletons, so no test inherits another's cached type names. */
async function freshHooks() {
  rt.unmount();
  vi.resetModules();
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  return await import('./use-names');
}

afterEach(() => {
  rt.unmount();
  vi.useRealTimers();
});

test('a failed type lookup asks again after 15 seconds, and a wider view fetches only the uncached ids', async () => {
  const { useTypeNames } = await freshHooks();
  h.apiFetch
    .mockResolvedValueOnce({ ok: false, kind: 'http', status: 503 })
    .mockResolvedValueOnce({ ok: true, data: { names: { '587': 'Rifter' } } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '603': 'Merlin' } } });
  expect(rt.render(useTypeNames, [587])).toEqual({});
  await vi.advanceTimersByTimeAsync(14_999);
  expect(rt.render(useTypeNames, [587])).toEqual({});
  expect(h.apiFetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  rt.render(useTypeNames, [587]);
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(useTypeNames, [587])).toEqual({ '587': 'Rifter' });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  rt.render(useTypeNames, [603, 587]);
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(useTypeNames, [603, 587])).toEqual({ '587': 'Rifter', '603': 'Merlin' });
  expect(h.apiFetch).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/eve/type-names' }), { body: { ids: [603] } });
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});

test('entity names ask again for every id after 30 seconds when the server left some pending', async () => {
  const { useEntityNames } = await freshHooks();
  h.apiFetch
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Pilot' }, pending: [2] } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Renamed pilot', '2': 'Late pilot' } } });
  rt.render(useEntityNames, [2, 1]);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(rt.render(useEntityNames, [2, 1])).toEqual({ '1': 'Pilot' });
  expect(h.apiFetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  rt.render(useEntityNames, [1, 2]);
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(useEntityNames, [1, 2])).toEqual({ '1': 'Renamed pilot', '2': 'Late pilot' });
  expect(h.apiFetch).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/eve/names' }), { body: { ids: [1, 2] } });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});
