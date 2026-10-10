import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  esiFetch: vi.fn(),
  readStored: vi.fn(),
  store: vi.fn(),
}));

vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => h.esiFetch(...args),
  esiUrl: (path: string) => `https://esi.test${path}`,
}));
vi.mock('./entity-names-store', () => ({
  readStoredEntityNames: (...args: unknown[]) => h.readStored(...args),
  storeEntityNames: (...args: unknown[]) => h.store(...args),
}));

import { resolveEntityNames, resolveEntityNamesStrict } from './entity-names';

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

beforeEach(() => {
  h.esiFetch.mockReset();
  h.readStored.mockReset().mockResolvedValue(new Map());
  h.store.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('resolveEntityNames', () => {
  it('asks ESI once for every id it has no stored answer for, and stores the answers', async () => {
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

  it('serves fresh stored answers without ESI, including remembered unresolvable ids', async () => {
    const now = new Date();
    h.readStored.mockResolvedValue(new Map([
      [1, { name: 'Stored Pilot', category: 'character', resolvedAt: now }],
      [2, { name: null, category: null, resolvedAt: now }],
    ]));

    await expect(resolveEntityNames([1, 2])).resolves.toEqual({ '1': 'Stored Pilot' });
    expect(h.esiFetch).not.toHaveBeenCalled();
    expect(h.store).not.toHaveBeenCalled();
  });

  it('asks again once a stored name or a stored miss has aged out', async () => {
    const old = new Date(Date.now() - 8 * DAY);
    const oldMiss = new Date(Date.now() - 7 * 60 * 60 * 1000);
    h.readStored.mockResolvedValue(new Map([
      [1, { name: 'Old Name', category: 'character', resolvedAt: old }],
      [2, { name: null, category: null, resolvedAt: oldMiss }],
    ]));
    h.esiFetch.mockImplementation(esiKnowing(new Set([1, 2])));

    await expect(resolveEntityNames([1, 2])).resolves.toEqual({ '1': 'Pilot 1', '2': 'Pilot 2' });
    expect(h.esiFetch).toHaveBeenCalledOnce();
  });

  it('finds the unresolvable ids in a 404 batch one at a time and remembers them', async () => {
    h.esiFetch.mockImplementation(esiKnowing(new Set([1, 3])));

    await expect(resolveEntityNames([1, 2, 3])).resolves.toEqual({ '1': 'Pilot 1', '3': 'Pilot 3' });

    // One batch, then one POST per id: only the bad id draws a second 404.
    expect(h.esiFetch).toHaveBeenCalledTimes(4);
    expect(storedRows()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 2, name: null }),
      expect.objectContaining({ id: 1, name: 'Pilot 1' }),
    ]));
  });

  it('caps the one-at-a-time retries a single resolution may spend', async () => {
    h.esiFetch.mockImplementation(esiKnowing(new Set()));
    const ids = Array.from({ length: 40 }, (_, index) => index + 1);

    await expect(resolveEntityNames(ids)).resolves.toEqual({});

    expect(h.esiFetch).toHaveBeenCalledTimes(1 + 25);
    // Only ids ESI answered alone are remembered; the rest are asked again next time.
    expect(storedRows()).toHaveLength(25);
  });

  it('never sends ids ESI cannot take, and treats a lone 404 as unresolvable without retrying', async () => {
    h.esiFetch.mockImplementation(esiKnowing(new Set()));

    await expect(resolveEntityNames([0, -4, 1.5, 3_000_000_000, 7])).resolves.toEqual({});

    expect(h.esiFetch).toHaveBeenCalledOnce();
    expect(posted(h.esiFetch.mock.calls[0]![1] as RequestInit)).toEqual([7]);
    expect(storedRows()).toEqual([{ id: 7, name: null, category: null }]);
  });

  it('splits more than 1000 ids into separate POSTs', async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => index + 1);
    h.esiFetch.mockImplementation(esiKnowing(new Set(ids)));

    const names = await resolveEntityNames(ids);

    expect(Object.keys(names)).toHaveLength(1001);
    expect(h.esiFetch.mock.calls.map(([, init]) => posted(init as RequestInit).length)).toEqual([1000, 1]);
  });

  it('remembers nothing from an outage and asks ESI when stored names are unavailable', async () => {
    h.readStored.mockRejectedValue(new Error('db down'));
    h.esiFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(resolveEntityNames([1, 2])).resolves.toEqual({});
    expect(h.store).not.toHaveBeenCalled();
  });

  it('still answers when the names cannot be stored', async () => {
    h.store.mockRejectedValue(new Error('db down'));
    h.esiFetch.mockImplementation(esiKnowing(new Set([1])));

    await expect(resolveEntityNames([1])).resolves.toEqual({ '1': 'Pilot 1' });
  });
});

describe('resolveEntityNamesStrict', () => {
  it('propagates malformed response failures while best-effort resolution omits the name', async () => {
    h.esiFetch.mockImplementation(async () => Response.json({ names: [] }));

    await expect(resolveEntityNamesStrict([7])).rejects.toThrow(
      'ESI /universe/names/ response was malformed',
    );
    await expect(resolveEntityNames([7])).resolves.toEqual({});
  });

  it('reports a missing entity when the response is a valid empty array', async () => {
    h.esiFetch.mockResolvedValue(Response.json([]));

    await expect(resolveEntityNamesStrict([7])).rejects.toThrow('EVE entity name missing for 7');
  });

  it('fails the whole result when any id cannot be named', async () => {
    h.esiFetch.mockImplementation(esiKnowing(new Set([1, 3])));

    await expect(resolveEntityNamesStrict([1, 2, 3])).rejects.toThrow('EVE entity name missing for 2');
  });

  it('fails on a transient upstream failure and recovers on the next call', async () => {
    h.esiFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ category: 'character', id: 7, name: 'Recovered Pilot' }]));

    await expect(resolveEntityNamesStrict([7])).rejects.toThrow('EVE entity name request failed (503)');
    await expect(resolveEntityNamesStrict([7])).resolves.toEqual({ '7': 'Recovered Pilot' });
  });

  it('names every id from one POST', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    h.esiFetch.mockImplementation(esiKnowing(new Set(ids)));

    await expect(resolveEntityNamesStrict(ids)).resolves.toEqual(
      Object.fromEntries(ids.map((id) => [String(id), `Pilot ${id}`])),
    );
    expect(h.esiFetch).toHaveBeenCalledOnce();
  });
});
