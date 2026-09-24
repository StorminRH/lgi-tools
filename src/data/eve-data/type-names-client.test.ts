import { expect, test, vi } from 'vitest';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/transport/api-client', () => ({ apiFetch: apiFetchMock }));
import { loadTypeNames } from './type-names-client';

test('normalizes and batches ship types without losing pilots past the request limit', async () => {
  apiFetchMock.mockReset().mockImplementation(async (_endpoint, options: { body: { ids: number[] } }) => ({
    ok: true, data: { names: Object.fromEntries(options.body.ids.map((id) => [String(id), `Ship ${id}`])) },
  }));
  expect(await loadTypeNames([])).toEqual({});
  const ids = Array.from({ length: 201 }, (_, index) => index + 1);
  const names = await loadTypeNames([...ids, 1, -1, NaN, 1.5]);
  expect(Object.keys(names)).toHaveLength(201);
  expect(names['201']).toBe('Ship 201');
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  expect(apiFetchMock.mock.calls[0]?.[1].body.ids).toHaveLength(200);
  expect(apiFetchMock.mock.calls[1]?.[1].body.ids).toEqual([201]);
  expect(await loadTypeNames([1, 201])).toEqual({ '1': 'Ship 1', '201': 'Ship 201' });
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  apiFetchMock.mockResolvedValueOnce({ ok: false, kind: 'http', status: 503 });
  await expect(loadTypeNames([587])).rejects.toThrow('type names 503');
  apiFetchMock.mockResolvedValueOnce({ ok: true, data: { names: { '587': 'Rifter' } } });
  const [first, second] = await Promise.all([loadTypeNames([587]), loadTypeNames([587])]);
  expect(first).toEqual({ '587': 'Rifter' });
  expect(second).toEqual(first);
  expect(apiFetchMock).toHaveBeenCalledTimes(4);
});
