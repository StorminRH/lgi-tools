import { expect, test, vi } from 'vitest';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/transport/api-client', () => ({ apiFetch: apiFetchMock }));
import { entityNamesEndpoint, typeNamesEndpoint } from './api-contract';
import { createNamesClient } from './names-client';

test('entity requests drop invalid ids, keep the sorted view cap and refresh mutable names on each load', async () => {
  const client = createNamesClient(entityNamesEndpoint, { maxIds: 2, cache: false });
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Old name' } } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'New name' } } });
  expect(await client.load([])).toEqual({});
  expect(await client.load([0, -1, 1.5, 2 ** 53])).toEqual({});
  expect(await client.load([3, 2, 1, 2, 0, 1.5])).toEqual({ '1': 'Old name' });
  expect(apiFetchMock).toHaveBeenLastCalledWith(entityNamesEndpoint, { body: { ids: [1, 2] } });
  expect(await client.load([1])).toEqual({ '1': 'New name' });
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  expect(client.retryMs).toBeUndefined();
});

test('cached clients isolate endpoint results and retry failed batches', async () => {
  const entities = createNamesClient(entityNamesEndpoint, { maxIds: 2, cache: true });
  const types = createNamesClient(typeNamesEndpoint, { maxIds: 2, cache: true, retryMs: 15_000 });
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Pilot' } } })
    .mockResolvedValueOnce({ ok: false, kind: 'http', status: 503 })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Ship' } } });
  expect(await entities.load([1])).toEqual({ '1': 'Pilot' });
  await expect(types.load([1])).rejects.toThrow('type names 503');
  expect(await types.load([1])).toEqual({ '1': 'Ship' });
  expect(await types.load([1, 0, 2 ** 53])).toEqual({ '1': 'Ship' });
  expect(await entities.load([1])).toEqual({ '1': 'Pilot' });
  expect(apiFetchMock).toHaveBeenCalledTimes(3);
});

test('entity outcomes carry the ids the server could not answer, and cached outcomes never do', async () => {
  const entities = createNamesClient(entityNamesEndpoint, { maxIds: 5, cache: false, retryMs: 30_000 });
  const types = createNamesClient(typeNamesEndpoint, { maxIds: 5, cache: true });
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Pilot' }, pending: [2] } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Ship' } } });
  await expect(entities.loadOutcome([1, 2])).resolves.toEqual({ names: { '1': 'Pilot' }, pending: [2] });
  await expect(types.loadOutcome([1])).resolves.toEqual({ names: { '1': 'Ship' }, pending: [] });
  await expect(entities.loadOutcome([])).resolves.toEqual({ names: {}, pending: [] });
});
