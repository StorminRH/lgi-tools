import { expect, test, vi } from 'vitest';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/transport/api-client', () => ({ apiFetch: apiFetchMock }));

/** Fresh client singletons, so no test inherits another's cached type names. */
async function freshClients() {
  vi.resetModules();
  return await import('./names-client');
}

const entityEndpoint = expect.objectContaining({ path: '/api/eve/names' });
const typeEndpoint = expect.objectContaining({ path: '/api/eve/type-names' });

test('entity requests drop invalid ids before the request cap and refresh mutable names on each load', async () => {
  const { entityNamesClient } = await freshClients();
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Old name' } } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'New name' } } })
    .mockResolvedValueOnce({ ok: false, kind: 'network' });
  expect(await entityNamesClient.load([])).toEqual({});
  expect(await entityNamesClient.load([0, -1, 1.5, NaN, 2 ** 53])).toEqual({});
  expect(apiFetchMock).not.toHaveBeenCalled();
  const descending = Array.from({ length: 201 }, (_, index) => 201 - index);
  expect(await entityNamesClient.load([0, -1, 1.5, NaN, ...descending, 2])).toEqual({ '1': 'Old name' });
  expect(apiFetchMock).toHaveBeenLastCalledWith(entityEndpoint, {
    body: { ids: Array.from({ length: 200 }, (_, index) => index + 1) },
  });
  expect(await entityNamesClient.load([1])).toEqual({ '1': 'New name' });
  await expect(entityNamesClient.load([1])).rejects.toThrow('entity names network');
  expect(apiFetchMock).toHaveBeenCalledTimes(3);
});

test('type names batch past the request limit, cache every answer and ask again for a failed batch', async () => {
  const { typeNamesClient } = await freshClients();
  apiFetchMock.mockReset().mockImplementation(async (_endpoint, options: { body: { ids: number[] } }) => ({
    ok: true, data: { names: Object.fromEntries(options.body.ids.map((id) => [String(id), `Ship ${id}`])) },
  }));
  expect(await typeNamesClient.load([])).toEqual({});
  const ids = Array.from({ length: 201 }, (_, index) => index + 1);
  const names = await typeNamesClient.load([...ids, 1, -1, NaN, 1.5]);
  expect(Object.keys(names)).toHaveLength(201);
  expect(names['201']).toBe('Ship 201');
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  expect(apiFetchMock.mock.calls[0]?.[1].body.ids).toHaveLength(200);
  expect(apiFetchMock.mock.calls[1]?.[1].body.ids).toEqual([201]);
  expect(await typeNamesClient.load([1, 201])).toEqual({ '1': 'Ship 1', '201': 'Ship 201' });
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  apiFetchMock.mockResolvedValueOnce({ ok: false, kind: 'api', status: 503, error: null });
  await expect(typeNamesClient.load([587])).rejects.toThrow('type names api 503');
  apiFetchMock.mockResolvedValueOnce({ ok: true, data: { names: { '587': 'Rifter' } } });
  const [first, second] = await Promise.all([typeNamesClient.load([587]), typeNamesClient.load([587])]);
  expect(first).toEqual({ '587': 'Rifter' });
  expect(second).toEqual(first);
  expect(apiFetchMock).toHaveBeenCalledTimes(4);
});

test('entity outcomes carry the ids the server could not answer, and cached outcomes never do', async () => {
  const { entityNamesClient, typeNamesClient } = await freshClients();
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Pilot' }, pending: [2] } })
    .mockResolvedValueOnce({ ok: true, data: { names: { '1': 'Ship' }, pending: [3] } });
  await expect(entityNamesClient.loadOutcome([1, 2])).resolves.toEqual({ names: { '1': 'Pilot' }, pending: [2] });
  await expect(typeNamesClient.loadOutcome([1, 3])).resolves.toEqual({ names: { '1': 'Ship' }, pending: [] });
  await expect(entityNamesClient.loadOutcome([])).resolves.toEqual({ names: {}, pending: [] });
});

test('type ids above the int4 range are dropped before batching, entity ids keep the wider range', async () => {
  const { entityNamesClient, typeNamesClient } = await freshClients();
  apiFetchMock.mockReset()
    .mockResolvedValueOnce({ ok: true, data: { names: { '587': 'Rifter' } } })
    .mockResolvedValueOnce({ ok: true, data: { names: {} } });
  expect(await typeNamesClient.load([587, 2 ** 31])).toEqual({ '587': 'Rifter' });
  expect(apiFetchMock).toHaveBeenLastCalledWith(typeEndpoint, { body: { ids: [587] } });
  await entityNamesClient.load([2 ** 31]);
  expect(apiFetchMock).toHaveBeenLastCalledWith(entityEndpoint, { body: { ids: [2 ** 31] } });
});
