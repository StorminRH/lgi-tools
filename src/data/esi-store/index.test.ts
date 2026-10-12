import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiStoreKey, StoredRow } from './types';

const readStoredRowsMock = vi.fn();
const recordResponseMock = vi.fn();
const recordUnchangedMock = vi.fn();
const singleFlightMock = vi.fn();
const esiFetchMock = vi.fn();
const readEsiAuthedMock = vi.fn();
const readEsiAuthedPostMock = vi.fn();
const readEsiPagedAuthedMock = vi.fn();
const expireNowMock = vi.fn();

vi.mock('./rows', () => ({
  readStoredRows: (...args: unknown[]) => readStoredRowsMock(...args),
  recordResponse: (...args: unknown[]) => recordResponseMock(...args),
  recordUnchanged: (...args: unknown[]) => recordUnchangedMock(...args),
}));
vi.mock('./single-flight', () => ({
  withGlobalSingleFlight: (...args: unknown[]) => singleFlightMock(...args),
}));
vi.mock('@/platform/esi', async () => ({
  ...(await vi.importActual<typeof import('@/platform/esi/errors')>('@/platform/esi/errors')),
  esiFetch: (...args: unknown[]) => esiFetchMock(...args),
  esiUrl: (path: string) => `https://esi.evetech.net${path}`,
}));
vi.mock('@/platform/esi/authed-read', () => ({
  readEsiAuthed: (...args: unknown[]) => readEsiAuthedMock(...args),
  readEsiAuthedPost: (...args: unknown[]) => readEsiAuthedPostMock(...args),
  readEsiPagedAuthed: (...args: unknown[]) => readEsiPagedAuthedMock(...args),
}));
vi.mock('@/lib/cache-expiry', () => ({ expireNow: (tag: string) => expireNowMock(tag) }));

import {
  commit,
  esiPassThrough,
  fetchStored,
  isDue,
  postStored,
  readStoredAuthed,
  readStoredPaged,
  recordExpiryFor,
  recordMetas,
  serverErrorMeta,
  storedExpiries,
  storedExpiry,
  storedRow,
  untilExpires,
} from './index';
import { EsiServerError } from '@/platform/esi';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const EXPIRES = 'Mon, 12 Oct 2026 12:05:00 GMT';
const MODIFIED = 'Mon, 12 Oct 2026 11:59:00 GMT';
const TOKEN = 'token';

const PRICE_KEY: EsiStoreKey = {
  route: '/markets/{region_id}/orders/',
  holder: { kind: 'global' },
  params: { region_id: 10000002, type_id: 34 },
};
const SKILLS_KEY: EsiStoreKey = { route: '/characters/{character_id}/skills/', holder: { kind: 'character', id: 91 } };
const ASSETS_KEY: EsiStoreKey = { route: '/corporations/{corporation_id}/assets/', holder: { kind: 'corporation', id: 98 } };
const JOURNAL_KEY: EsiStoreKey = { route: '/characters/{character_id}/wallet/journal/', holder: { kind: 'character', id: 91 } };
const AFFILIATION_KEY: EsiStoreKey = { route: '/characters/affiliation/', holder: { kind: 'character', id: 91 } };
const STATUS_KEY: EsiStoreKey = { route: '/status/', holder: { kind: 'global' } };

function stored(expiresAt: number | null, etags: string[] = ['"held"']): StoredRow {
  return { expiresAt, etags, lastModified: null, checkedAt: NOW - 1000, body: null };
}

function rows(...stored: (StoredRow | null)[]): void {
  readStoredRowsMock.mockResolvedValue(stored);
}

function response(status: number, headers: Record<string, string> = {}, body: unknown = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

function fetchHeaders(call = 0): Headers {
  return new Headers((esiFetchMock.mock.calls[call]?.[1] as RequestInit).headers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  singleFlightMock.mockImplementation((_text: string, work: () => Promise<unknown>) =>
    work().then((result) => ({ busy: false, result })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('fetchStored', () => {
  it('answers unchanged without calling while the stored expiry has not passed', async () => {
    rows(stored(NOW + 60_000));
    await expect(fetchStored(PRICE_KEY)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 60_000 });
    expect(esiFetchMock).not.toHaveBeenCalled();
    expect(singleFlightMock).not.toHaveBeenCalled();
  });

  it('calls with If-None-Match once due and records a 304 at once', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES, 'Last-Modified': MODIFIED, 'x-esi-cache-status': 'HIT' }));

    const result = await fetchStored(PRICE_KEY);

    expect(result).toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(esiFetchMock).toHaveBeenCalledWith(
      'https://esi.evetech.net/markets/10000002/orders/?type_id=34',
      { headers: { 'If-None-Match': '"held"' } },
      undefined,
    );
    expect(recordUnchangedMock).toHaveBeenCalledWith(PRICE_KEY, {
      expiresAt: Date.parse(EXPIRES),
      lastModified: Date.parse(MODIFIED),
      checkedAt: NOW,
    });
    expect(recordResponseMock).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[esi-store]', {
      route: PRICE_KEY.route,
      holder: 'global',
      status: 304,
      cacheStatus: 'HIT',
    });
  });

  it('returns a 200 with its meta and records nothing until the caller commits', async () => {
    rows(stored(null, []));
    esiFetchMock.mockResolvedValueOnce(response(200, { ETag: '"new"', Expires: EXPIRES }, [{ price: 5 }]));

    const result = await fetchStored(PRICE_KEY);

    expect(result.kind).toBe('fresh');
    if (result.kind !== 'fresh') return;
    expect(await result.res.json()).toEqual([{ price: 5 }]);
    expect(result.meta).toEqual({
      key: PRICE_KEY,
      expiresAt: Date.parse(EXPIRES),
      etags: ['"new"'],
      lastModified: null,
      checkedAt: NOW,
    });
    expect(fetchHeaders().has('If-None-Match')).toBe(false);
    expect(recordResponseMock).not.toHaveBeenCalled();
    expect(recordUnchangedMock).not.toHaveBeenCalled();

    await commit([result.meta], { tag: 'eve:market_prices' });
    expect(recordResponseMock).toHaveBeenCalledWith(result.meta);
    expect(expireNowMock).toHaveBeenCalledWith('eve:market_prices');
  });

  it('falls back to the route\'s published cache time when ESI sends no Expires', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, { ETag: '"new"' }));
    const result = await fetchStored(PRICE_KEY);
    expect(result.kind === 'fresh' && result.meta.expiresAt).toBe(NOW + 300_000);
  });

  it('leaves a history answer with no Expires due at once, since the spec declares no cache time', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, {}));
    const result = await fetchStored({ route: '/markets/{region_id}/history/', holder: { kind: 'global' }, params: { region_id: 1, type_id: 34 } });
    expect(result.kind === 'fresh' && result.meta.expiresAt).toBeNull();
  });

  it('keeps the whole document in the meta of a keepBody route', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES }, { players: 12 }));
    const result = await fetchStored(STATUS_KEY);
    expect(result.kind === 'fresh' && result.meta.body).toEqual({ players: 12 });
    expect(result.kind === 'fresh' && (await result.res.json())).toEqual({ players: 12 });
  });

  it('records nothing on an error answer, so the next view retries', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(404));
    await expect(fetchStored(PRICE_KEY)).resolves.toEqual({ kind: 'error', status: 404 });
    expect(recordResponseMock).not.toHaveBeenCalled();
    expect(recordUnchangedMock).not.toHaveBeenCalled();
  });

  it('sends no If-None-Match when the call is declared unconditional', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(200, { ETag: '"dump"', Expires: EXPIRES }));
    await fetchStored(PRICE_KEY, { conditional: false, interactive: true });
    expect(fetchHeaders().has('If-None-Match')).toBe(false);
    expect(esiFetchMock.mock.calls[0]?.[2]).toEqual({ interactive: true });
  });

  it('serves the stored copy when another instance holds the global key', async () => {
    rows(stored(NOW - 1));
    singleFlightMock.mockResolvedValueOnce({ busy: true });
    await expect(fetchStored(PRICE_KEY)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW - 1 });
    expect(singleFlightMock).toHaveBeenCalledWith('/markets/{region_id}/orders/|global|0||region_id=10000002&type_id=34', expect.any(Function));
    expect(esiFetchMock).not.toHaveBeenCalled();
  });

  it('takes no lock for an owner key', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await fetchStored(SKILLS_KEY);
    expect(singleFlightMock).not.toHaveBeenCalled();
    expect(esiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a route declared for the map tracker alone, a pass-through route, and a holder the route is not held by', async () => {
    await expect(esiPassThrough('/characters/{character_id}/skills/', { character_id: 1 })).rejects.toThrow(
      'ESI route /characters/{character_id}/skills/ is not declared pass-through',
    );
    await expect(
      fetchStored({ route: '/universe/structures/{structure_id}/', holder: { kind: 'global' }, params: { structure_id: 1 } }),
    ).rejects.toThrow('ESI route /universe/structures/{structure_id}/ is declared pass-through, not stored');
    await expect(fetchStored({ route: '/characters/{character_id}/skills/', holder: { kind: 'global' } })).rejects.toThrow(
      'ESI route /characters/{character_id}/skills/ is held by character, not global',
    );
    expect(esiFetchMock).not.toHaveBeenCalled();
  });
});

describe('esiPassThrough', () => {
  it('always calls and records nothing', async () => {
    esiFetchMock.mockResolvedValue(response(200, { Expires: EXPIRES, ETag: '"x"' }));
    await esiPassThrough('/universe/structures/{structure_id}/', { structure_id: 1_000_000_000_001 });
    await esiPassThrough('/universe/structures/{structure_id}/', { structure_id: 1_000_000_000_001 }, { method: 'GET' }, { interactive: true });
    expect(esiFetchMock).toHaveBeenNthCalledWith(1, 'https://esi.evetech.net/universe/structures/1000000000001/', undefined, undefined);
    expect(esiFetchMock).toHaveBeenNthCalledWith(2, 'https://esi.evetech.net/universe/structures/1000000000001/', { method: 'GET' }, { interactive: true });
    expect(readStoredRowsMock).not.toHaveBeenCalled();
    expect(recordResponseMock).not.toHaveBeenCalled();
    expect(recordUnchangedMock).not.toHaveBeenCalled();
  });
});

describe('readStoredAuthed', () => {
  it('answers unchanged without calling while the stored expiry has not passed', async () => {
    rows(stored(NOW + 1));
    await expect(readStoredAuthed(SKILLS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 1 });
    expect(readEsiAuthedMock).not.toHaveBeenCalled();
  });

  it('replays the held ETag and records a 304 with its headers', async () => {
    rows(stored(NOW));
    const rl = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'unchanged', expiresAt: NOW + 120_000, lastModified: MODIFIED, cacheStatus: 'HIT' });

    await expect(readStoredAuthed(SKILLS_KEY, TOKEN, rl)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 120_000 });

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, '"held"', rl);
    expect(recordUnchangedMock).toHaveBeenCalledWith(SKILLS_KEY, { expiresAt: NOW + 120_000, lastModified: Date.parse(MODIFIED), checkedAt: NOW });
    expect(console.info).toHaveBeenCalledWith('[esi-store]', { route: SKILLS_KEY.route, holder: 'character', status: 'unchanged', cacheStatus: 'HIT' });
  });

  it('returns a fresh body with its meta and leaves the recording to commit', async () => {
    rows(null);
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'fresh', body: { total_sp: 1 }, etag: '"new"', expiresAt: null, lastModified: null, cacheStatus: 'MISS' });

    const result = await readStoredAuthed(SKILLS_KEY, TOKEN);

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, null, undefined);
    expect(result).toEqual({
      kind: 'fresh',
      body: { total_sp: 1 },
      etag: '"new"',
      meta: { key: SKILLS_KEY, expiresAt: NOW + 60_000, etags: ['"new"'], lastModified: null, checkedAt: NOW },
    });
    expect(recordResponseMock).not.toHaveBeenCalled();
  });

  it('never sends If-None-Match for the journal and passes an error through unrecorded', async () => {
    rows(stored(NOW - 1, ['"journal"']));
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(readStoredAuthed(JOURNAL_KEY, TOKEN)).resolves.toEqual({ kind: 'error', code: 'esi_403' });
    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/wallet/journal/', TOKEN, null, undefined);
    expect(recordUnchangedMock).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[esi-store]', { route: JOURNAL_KEY.route, holder: 'character', status: 'esi_403', cacheStatus: null });
  });
});

describe('postStored', () => {
  it('answers unchanged while unexpired and otherwise posts the body and returns the meta', async () => {
    rows(stored(NOW + 1));
    await expect(postStored(AFFILIATION_KEY, TOKEN, [91])).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 1 });
    expect(readEsiAuthedPostMock).not.toHaveBeenCalled();

    rows(null);
    readEsiAuthedPostMock.mockResolvedValueOnce({ kind: 'fresh', body: [{ character_id: 91 }], etag: null, expiresAt: NOW + 5000 });
    const result = await postStored(AFFILIATION_KEY, TOKEN, [91]);
    expect(readEsiAuthedPostMock).toHaveBeenCalledWith('/characters/affiliation/', TOKEN, [91]);
    expect(result).toEqual({
      kind: 'fresh',
      body: [{ character_id: 91 }],
      etag: null,
      meta: { key: AFFILIATION_KEY, expiresAt: NOW + 5000, etags: [], lastModified: null, checkedAt: NOW },
    });
  });
});

describe('readStoredPaged', () => {
  it('replays every held page ETag and records a 304', async () => {
    rows(stored(NOW - 1, ['"p1"', '"p2"']));
    readEsiPagedAuthedMock.mockResolvedValueOnce({ kind: 'unchanged', expiresAt: NOW + 3_600_000, cacheStatus: 'HIT' });
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 3_600_000 });
    expect(readEsiPagedAuthedMock).toHaveBeenCalledWith('/corporations/98/assets/', TOKEN, ['"p1"', '"p2"'], undefined);
    expect(recordUnchangedMock).toHaveBeenCalledWith(ASSETS_KEY, { expiresAt: NOW + 3_600_000, lastModified: null, checkedAt: NOW });
  });

  it('keeps every page ETag in the meta of a fresh read', async () => {
    rows(null);
    const responseHeaders = [{ page: 1, cacheControl: null, etag: '"a"', lastModified: MODIFIED, xPages: 2 }];
    readEsiPagedAuthedMock.mockResolvedValueOnce({
      kind: 'fresh',
      items: [1, 2],
      etags: ['"a"', '"b"'],
      expiresAt: NOW + 1000,
      responseHeaders,
      lastModified: MODIFIED,
      cacheStatus: 'MISS',
    });
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).resolves.toEqual({
      kind: 'fresh',
      items: [1, 2],
      etags: ['"a"', '"b"'],
      responseHeaders,
      meta: { key: ASSETS_KEY, expiresAt: NOW + 1000, etags: ['"a"', '"b"'], lastModified: Date.parse(MODIFIED), checkedAt: NOW },
    });
  });

  it('answers unchanged while unexpired and passes an error through', async () => {
    rows(stored(NOW + 1));
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 1 });
    rows(null);
    readEsiPagedAuthedMock.mockResolvedValueOnce({ kind: 'error', code: 'contract_error' });
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).resolves.toEqual({ kind: 'error', code: 'contract_error' });
  });
});

describe('isDue and storedExpiry', () => {
  it('is due when any key is missing, unset or past, and never when nothing is asked', async () => {
    rows(stored(NOW + 1), null);
    await expect(isDue([SKILLS_KEY, ASSETS_KEY])).resolves.toBe(true);
    rows(stored(NOW + 1), stored(NOW));
    await expect(isDue([SKILLS_KEY, ASSETS_KEY])).resolves.toBe(true);
    rows(stored(NOW + 1), stored(NOW + 2));
    await expect(isDue([SKILLS_KEY, ASSETS_KEY])).resolves.toBe(false);
    rows();
    await expect(isDue([])).resolves.toBe(false);
  });

  it('reports the earliest expiry, or null when a key is due or none is asked', async () => {
    rows(stored(NOW + 5000), stored(NOW + 1000));
    await expect(storedExpiry([SKILLS_KEY, ASSETS_KEY])).resolves.toBe(NOW + 1000);
    rows(stored(NOW + 5000), null);
    await expect(storedExpiry([SKILLS_KEY, ASSETS_KEY])).resolves.toBeNull();
    await expect(storedExpiry([])).resolves.toBeNull();
    expect(readStoredRowsMock).toHaveBeenCalledTimes(2);
  });
});

describe('untilExpires', () => {
  it('is part of the store API, for readers to pass to cacheLife', () => {
    expect(untilExpires(NOW + 10_000, NOW)).toEqual({ stale: 10, revalidate: 10, expire: 10 });
  });
});

describe('commit and recordExpiryFor', () => {
  it('records nothing and clears nothing when no 200 was committed', async () => {
    await commit([], { tag: 'eve:skills:character:91' });
    expect(recordResponseMock).not.toHaveBeenCalled();
    expect(expireNowMock).not.toHaveBeenCalled();
  });

  it('fans one answer\'s expiry out to every key without its ETag or body', async () => {
    const meta = { key: PRICE_KEY, expiresAt: NOW + 300_000, etags: ['"dump"'], lastModified: NOW, checkedAt: NOW, body: { x: 1 } };
    const other: EsiStoreKey = { ...PRICE_KEY, params: { region_id: 10000002, type_id: 35 } };
    await recordExpiryFor([PRICE_KEY, other], meta);
    expect(recordResponseMock.mock.calls.map((call) => call[0])).toEqual([
      { key: PRICE_KEY, expiresAt: NOW + 300_000, etags: [], lastModified: NOW, checkedAt: NOW },
      { key: other, expiresAt: NOW + 300_000, etags: [], lastModified: NOW, checkedAt: NOW },
    ]);
    expect(expireNowMock).not.toHaveBeenCalled();
  });
});

describe('the daily downtime halt', () => {
  const IN_WINDOW = Date.parse('2026-10-12T11:05:00Z');
  const HALT_UNTIL = Date.parse('2026-10-12T11:30:00Z');
  const haltedStatusRow: StoredRow = {
    ...stored(IN_WINDOW + 20_000, []),
    body: { status: { state: 'offline' }, halt: { failures: [IN_WINDOW - 60_000, IN_WINDOW - 30_000], haltUntil: HALT_UNTIL } },
  };

  it('serves the stored copy of every stored read while the status row says halted', async () => {
    vi.setSystemTime(IN_WINDOW);
    readStoredRowsMock.mockImplementation((keys: EsiStoreKey[]) =>
      Promise.resolve(keys.map((key) => (key.route === '/status/' ? haltedStatusRow : stored(IN_WINDOW - 1)))),
    );

    await expect(fetchStored(PRICE_KEY)).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW - 1 });
    await expect(readStoredAuthed(SKILLS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW - 1 });
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW - 1 });
    await expect(postStored(AFFILIATION_KEY, TOKEN, [91])).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW - 1 });
    await expect(esiPassThrough('/universe/structures/{structure_id}/', { structure_id: 1 })).rejects.toBeInstanceOf(EsiServerError);
    expect(esiFetchMock).not.toHaveBeenCalled();
    expect(readEsiAuthedMock).not.toHaveBeenCalled();
    expect(readEsiPagedAuthedMock).not.toHaveBeenCalled();
    expect(readEsiAuthedPostMock).not.toHaveBeenCalled();
  });

  it('lets the status probe itself through the halt', async () => {
    vi.setSystemTime(IN_WINDOW + 25_000);
    readStoredRowsMock.mockResolvedValue([haltedStatusRow]);
    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES }, { players: 0 }));

    await expect(fetchStored(STATUS_KEY)).resolves.toMatchObject({ kind: 'fresh' });
    expect(esiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads no status row outside the window, and ignores a stale halt once 11:30 has passed', async () => {
    vi.setSystemTime(NOW);
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await fetchStored(PRICE_KEY);
    expect(readStoredRowsMock.mock.calls.every(([keys]) => (keys as EsiStoreKey[]).every((key) => key.route !== '/status/'))).toBe(true);

    vi.setSystemTime(HALT_UNTIL);
    readStoredRowsMock.mockImplementation((keys: EsiStoreKey[]) =>
      Promise.resolve(keys.map((key) => (key.route === '/status/' ? haltedStatusRow : stored(HALT_UNTIL - 1)))),
    );
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await expect(fetchStored(PRICE_KEY)).resolves.toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(esiFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('storedExpiries, storedRow, recordMetas and serverErrorMeta', () => {
  it('reports each key\'s expiry in order and one key\'s whole row', async () => {
    rows(stored(NOW + 5000), null, stored(null));
    await expect(storedExpiries([PRICE_KEY, SKILLS_KEY, STATUS_KEY])).resolves.toEqual([NOW + 5000, null, null]);
    rows({ ...stored(NOW + 5000, []), body: { players: 3 } });
    await expect(storedRow(STATUS_KEY)).resolves.toMatchObject({ expiresAt: NOW + 5000, body: { players: 3 } });
    rows(null);
    await expect(storedRow(STATUS_KEY)).resolves.toBeNull();
  });

  it('records metas without touching the cache', async () => {
    const meta = { key: PRICE_KEY, expiresAt: NOW + 1, etags: ['"a"'], lastModified: null, checkedAt: NOW };
    await recordMetas([meta]);
    expect(recordResponseMock).toHaveBeenCalledWith(meta);
    expect(expireNowMock).not.toHaveBeenCalled();
  });

  it('gives a 503 the expiry it sent, else the route\'s spec cache time, and no ETag', () => {
    const withExpires = serverErrorMeta(STATUS_KEY, new EsiServerError(503, null, { expires: EXPIRES }), NOW);
    expect(withExpires).toEqual({ key: STATUS_KEY, expiresAt: Date.parse(EXPIRES), etags: [], lastModified: null, checkedAt: NOW });
    const bare = serverErrorMeta(STATUS_KEY, new EsiServerError(503), NOW);
    expect(bare.expiresAt).toBe(NOW + 30_000);
  });
});
