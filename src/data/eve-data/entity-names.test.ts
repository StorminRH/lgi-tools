import { expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const h = vi.hoisted(() => ({
esiFetch: vi.fn(),
readStored: vi.fn(),
store: vi.fn(),
}));

vi.mock('@/data/esi-store', async () => {
const { passThroughStub } = await import('@/data/esi-store/__tests__/pass-through-stub');
return passThroughStub((...args) => h.esiFetch(...args));
});
vi.mock('./entity-names-store', () => ({
readStoredEntityNames: (...args: unknown[]) => h.readStored(...args),
storeEntityNames: (...args: unknown[]) => h.store(...args),
}));

import { resolveEntityNames, resolveEntityNamesStrict, resolveEntityNamesWithPending } from './entity-names';

const DAY = 24 * 60 * 60 * 1000;

function posted(init: RequestInit): number[] {
return JSON.parse(String(init.body)) as number[];
}

/** ESI's real behaviour: 404 for the whole batch when any id is unknown. */
function esiKnowing(known: ReadonlySet<number>) {
return async (_url: string, init: RequestInit) => {
  const ids = posted(init);
  if (ids.some((id) => !known.has(id))) return new Response(null, { status: 404 });
  return Response.json(ids.map((id) => ({ category: 'character', id, name: `Pilot ${id}` })));
};
}

function storedRows(): { id: number; name: string | null }[] {
return h.store.mock.calls.flatMap(([rows]) => rows as { id: number; name: string | null }[]);
}

function fresh(): void {
vi.restoreAllMocks();
h.esiFetch.mockReset();
h.readStored.mockReset().mockResolvedValue(new Map());
h.store.mockReset().mockResolvedValue(undefined);
silenceConsolePrefixes('warn', ['[entity-names]']);
}

test('asks ESI once for every id it has no stored answer for, and stores the answers', async () => {
  fresh();
  h.esiFetch.mockImplementation(esiKnowing(new Set([1, 2, 3])));

  await expect(resolveEntityNames([1, 2, 2, 3])).resolves.toEqual({
    '1': 'Pilot 1',
    '2': 'Pilot 2',
    '3': 'Pilot 3',
  });

  expect(h.esiFetch).toHaveBeenCalledOnce();
  expect(posted(h.esiFetch.mock.calls[0]![1] as RequestInit)).toEqual([1, 2, 3]);
  expect(storedRows().map((row) => row.id)).toEqual([1, 2, 3]);
});

test('reuses stored answers while fresh, and asks again once a name or a miss has aged out', async () => {
  fresh();
  const now = new Date();
  h.readStored.mockResolvedValue(new Map([
    [1, { name: 'Stored Pilot', category: 'character', resolvedAt: now }],
    [2, { name: null, category: null, resolvedAt: now }],
    [3, { name: 'Week Old', category: 'character', resolvedAt: new Date(Date.now() - 6 * DAY) }],
  ]));
  await expect(resolveEntityNames([1, 2, 3])).resolves.toEqual({ '1': 'Stored Pilot', '3': 'Week Old' });
  expect(h.esiFetch).not.toHaveBeenCalled();
  expect(h.store).not.toHaveBeenCalled();

  h.readStored.mockResolvedValue(new Map([
    [1, { name: 'Old Name', category: 'character', resolvedAt: new Date(Date.now() - 8 * DAY) }],
    [2, { name: null, category: null, resolvedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) }],
  ]));
  h.esiFetch.mockImplementation(esiKnowing(new Set([1, 2])));
  await expect(resolveEntityNames([1, 2])).resolves.toEqual({ '1': 'Pilot 1', '2': 'Pilot 2' });
  expect(h.esiFetch).toHaveBeenCalledOnce();
});

test('splits a 404 batch in halves to find its unresolvable ids, and remembers them', async () => {
  fresh();
  h.esiFetch.mockImplementation(esiKnowing(new Set([1, 3])));

  await expect(resolveEntityNames([1, 2, 3])).resolves.toEqual({ '1': 'Pilot 1', '3': 'Pilot 3' });

  // [1,2,3] 404s, then [1,2] 404s beside [3], then [1] beside [2], which 404s alone.
  expect(h.esiFetch.mock.calls.map(([, init]) => posted(init as RequestInit))).toEqual(
    expect.arrayContaining([[1, 2, 3], [1, 2], [3], [1], [2]]),
  );
  expect(h.esiFetch).toHaveBeenCalledTimes(5);
  expect(storedRows()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 2, name: null }),
    expect.objectContaining({ id: 1, name: 'Pilot 1' }),
  ]));
});

test('names every other id in one resolution when a long batch holds one unresolvable id', async () => {
  fresh();
  const ids = Array.from({ length: 200 }, (_, index) => index + 1);
  h.esiFetch.mockImplementation(esiKnowing(new Set(ids.filter((id) => id !== 137))));

  const names = await resolveEntityNames(ids);

  expect(Object.keys(names)).toHaveLength(199);
  expect(names['137']).toBeUndefined();
  const statuses = await Promise.all(h.esiFetch.mock.results.map(async ({ value }) => (await value).status));
  // About log2(200) halvings: far fewer 404s against the shared budget than one POST per id.
  expect(statuses.filter((status) => status === 404).length).toBeLessThanOrEqual(9);
  expect(storedRows()).toEqual(expect.arrayContaining([{ id: 137, name: null, category: null }]));
});

test('caps the halving POSTs a single resolution may spend', async () => {
  fresh();
  h.esiFetch.mockImplementation(esiKnowing(new Set()));
  const ids = Array.from({ length: 40 }, (_, index) => index + 1);

  await expect(resolveEntityNames(ids)).resolves.toEqual({});

  // The first batch, then 12 halvings of two POSTs each before the budget of 25 runs out.
  expect(h.esiFetch).toHaveBeenCalledTimes(1 + 24);
  // Only ids ESI answered alone are remembered; the rest are asked again next time.
  expect(storedRows().every((row) => row.name === null)).toBe(true);
});

test('never sends ids ESI cannot take, and treats a lone 404 as unresolvable without retrying', async () => {
  fresh();
  h.esiFetch.mockImplementation(esiKnowing(new Set()));

  await expect(resolveEntityNames([0, -4, 1.5, 3_000_000_000, 7])).resolves.toEqual({});

  expect(h.esiFetch).toHaveBeenCalledOnce();
  expect(posted(h.esiFetch.mock.calls[0]![1] as RequestInit)).toEqual([7]);
  expect(storedRows()).toEqual([{ id: 7, name: null, category: null }]);
});

test('splits more than 1000 ids into separate POSTs', async () => {
  fresh();
  const ids = Array.from({ length: 1001 }, (_, index) => index + 1);
  h.esiFetch.mockImplementation(esiKnowing(new Set(ids)));

  const names = await resolveEntityNames(ids);

  expect(Object.keys(names)).toHaveLength(1001);
  expect(h.esiFetch.mock.calls.map(([, init]) => posted(init as RequestInit).length)).toEqual([1000, 1]);
});

test('asks ESI when stored names are unavailable', async () => {
  fresh();
  h.readStored.mockRejectedValue(new Error('db down'));
  h.esiFetch.mockImplementation(esiKnowing(new Set([1, 2])));

  await expect(resolveEntityNames([1, 2])).resolves.toEqual({ '1': 'Pilot 1', '2': 'Pilot 2' });
  expect(h.esiFetch).toHaveBeenCalledOnce();
});

test('remembers nothing from an outage', async () => {
  fresh();
  h.esiFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

  await expect(resolveEntityNames([1, 2])).resolves.toEqual({});
  expect(h.store).not.toHaveBeenCalled();
});

test('reports which ids ESI could not answer this time, apart from ids it does not know', async () => {
  fresh();
  h.readStored.mockResolvedValue(new Map([
    [3, { name: 'Old Name', category: 'corporation', resolvedAt: new Date(Date.now() - 20 * DAY) }],
  ]));
  // 1 is unknown to ESI; 2 and 3 meet a 503 once the 404 batch is split.
  h.esiFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const ids = posted(init);
    return new Response(null, { status: ids.length > 1 || ids[0] === 1 ? 404 : 503 });
  });

  const outcome = await resolveEntityNamesWithPending([1, 2, 3]);

  // 3 falls back to its stored name; only 2 is left to ask for again.
  expect(outcome).toEqual({ names: { '3': 'Old Name' }, pending: [2] });
  expect(storedRows()).toEqual([{ id: 1, name: null, category: null }]);
});

test('serves an older stored name when ESI cannot answer for it now', async () => {
  fresh();
  h.readStored.mockResolvedValue(new Map([
    [1, { name: 'Old Name', category: 'corporation', resolvedAt: new Date(Date.now() - 20 * DAY) }],
  ]));
  h.esiFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

  await expect(resolveEntityNames([1, 2])).resolves.toEqual({ '1': 'Old Name' });
  await expect(resolveEntityNamesStrict([1])).rejects.toThrow();
});

test('still answers when the names cannot be stored', async () => {
  fresh();
  h.store.mockRejectedValue(new Error('db down'));
  h.esiFetch.mockImplementation(esiKnowing(new Set([1])));

  await expect(resolveEntityNames([1])).resolves.toEqual({ '1': 'Pilot 1' });
});

test('strict resolution throws for a malformed body, an empty answer, any unnamed id, and an outage, then recovers', async () => {
  fresh();
  h.esiFetch.mockImplementation(async () => Response.json({ names: [] }));
  await expect(resolveEntityNamesStrict([7])).rejects.toThrow('ESI /universe/names/ response was malformed');
  // Best-effort resolution of the same answer omits the name instead.
  await expect(resolveEntityNames([7])).resolves.toEqual({});

  h.esiFetch.mockReset().mockImplementation(async () => Response.json([]));
  await expect(resolveEntityNamesStrict([7])).rejects.toThrow('EVE entity name missing for 7');

  h.esiFetch.mockReset().mockImplementation(esiKnowing(new Set([1, 3])));
  await expect(resolveEntityNamesStrict([1, 2, 3])).rejects.toThrow('EVE entity name missing for 2');

  h.esiFetch
    .mockReset()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json([{ category: 'character', id: 7, name: 'Recovered Pilot' }]));
  await expect(resolveEntityNamesStrict([7])).rejects.toThrow('EVE entity name request failed (503)');
  await expect(resolveEntityNamesStrict([7])).resolves.toEqual({ '7': 'Recovered Pilot' });
});
