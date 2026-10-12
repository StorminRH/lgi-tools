import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiStoreKey, StoredRow } from './types';

const readStoredRowsMock = vi.fn();
const recordResponsesMock = vi.fn();
const recordUnchangedManyMock = vi.fn();
const deleteStoredRowsMock = vi.fn();
const esiFetchMock = vi.fn();
const readEsiAuthedMock = vi.fn();
const readEsiAuthedPostMock = vi.fn();
const readEsiPagedAuthedMock = vi.fn();
const expireNowMock = vi.fn();

vi.mock('./rows', () => ({
  readStoredRows: (...args: unknown[]) => readStoredRowsMock(...args),
  recordResponses: (...args: unknown[]) => recordResponsesMock(...args),
  recordUnchangedMany: (...args: unknown[]) => recordUnchangedManyMock(...args),
  deleteStoredRows: (...args: unknown[]) => deleteStoredRowsMock(...args),
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
  datasetTag,
  esiPassThrough,
  fetchStored,
  fetchStoredMany,
  forgetStored,
  isDue,
  isDueFor,
  postPassThroughAuthed,
  postStored,
  postStoredBatch,
  readPassThroughAuthed,
  readStoredAuthed,
  readStoredPaged,
  recordExpiryFor,
  recordMetas,
  recordRefusal,
  recordRefusalFor,
  refusalKeyFor,
  refusalMeta,
  serverErrorMeta,
  storedExpiries,
  storedExpiry,
  storedRow,
  untilExpires,
} from './index';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';

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

/** A parser that hands the JSON body back as ESI sent it. */
const AS_IS = { parse: (body: unknown): unknown => body };

function fetchHeaders(call = 0): Headers {
  return new Headers((esiFetchMock.mock.calls[call]?.[1] as RequestInit).headers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('fetchStored', () => {
  it('answers unchanged without calling while the stored expiry has not passed', async () => {
    rows(stored(NOW + 60_000));
    await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 60_000 });
    expect(esiFetchMock).not.toHaveBeenCalled();
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
  });

  it('calls with If-None-Match once due and records a 304 at once', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES, 'Last-Modified': MODIFIED, 'x-esi-cache-status': 'HIT' }));

    const result = await fetchStored(PRICE_KEY, AS_IS);

    expect(result).toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(esiFetchMock).toHaveBeenCalledWith(
      'https://esi.evetech.net/markets/10000002/orders/?type_id=34',
      { headers: { 'If-None-Match': '"held"' } },
      undefined,
    );
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([
      { key: PRICE_KEY, expiresAt: Date.parse(EXPIRES), lastModified: Date.parse(MODIFIED), checkedAt: NOW },
    ]);
    expect(recordResponsesMock).not.toHaveBeenCalled();
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

    const result = await fetchStored(PRICE_KEY, AS_IS);

    expect(result.kind).toBe('fresh');
    if (result.kind !== 'fresh') return;
    expect(result.value).toEqual([{ price: 5 }]);
    expect(result.meta).toEqual({
      key: PRICE_KEY,
      expiresAt: Date.parse(EXPIRES),
      etags: ['"new"'],
      lastModified: null,
      checkedAt: NOW,
    });
    expect(fetchHeaders().has('If-None-Match')).toBe(false);
    expect(recordResponsesMock).not.toHaveBeenCalled();
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();

    await commit([result.meta], { tag: 'eve:market_prices' });
    expect(recordResponsesMock).toHaveBeenCalledWith([result.meta]);
    expect(expireNowMock).toHaveBeenCalledWith('eve:market_prices');
  });

  it('falls back to the route\'s published cache time when ESI sends no Expires', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, { ETag: '"new"' }));
    const result = await fetchStored(PRICE_KEY, AS_IS);
    expect(result.kind === 'fresh' && result.meta.expiresAt).toBe(NOW + 300_000);
  });

  it('leaves a history answer with no Expires due at once, since the spec declares no cache time', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, {}));
    const result = await fetchStored({ route: '/markets/{region_id}/history/', holder: { kind: 'global' }, params: { region_id: 1, type_id: 34 } }, AS_IS);
    expect(result.kind === 'fresh' && result.meta.expiresAt).toBeNull();
  });

  it('keeps the whole document in the meta of a keepBody route', async () => {
    rows(null);
    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES }, { players: 12 }));
    const result = await fetchStored(STATUS_KEY, AS_IS);
    expect(result.kind === 'fresh' && result.meta.body).toEqual({ players: 12 });
    expect(result.kind === 'fresh' && result.value).toEqual({ players: 12 });
  });

  it('records nothing on an error answer, so the next view retries', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(404));
    await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'error', status: 404 });
    expect(recordResponsesMock).not.toHaveBeenCalled();
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
  });

  it('throws what its one call threw, as the budget gate or a 5xx always did', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockRejectedValueOnce(new EsiServerError(502));
    await expect(fetchStored(PRICE_KEY, AS_IS)).rejects.toBeInstanceOf(EsiServerError);
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
  });

  it('sends no If-None-Match when the call is declared unconditional', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(200, { ETag: '"dump"', Expires: EXPIRES }));
    await fetchStored(PRICE_KEY, { ...AS_IS, conditional: false, interactive: true });
    expect(fetchHeaders().has('If-None-Match')).toBe(false);
    expect(esiFetchMock.mock.calls[0]?.[2]).toEqual({ interactive: true });
  });

  it('calls a due global key at once, under no lock, however many instances find it due together', async () => {
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValue(response(304, { Expires: EXPIRES }));
    await Promise.all([fetchStored(PRICE_KEY, AS_IS), fetchStored(PRICE_KEY, AS_IS)]);
    expect(esiFetchMock).toHaveBeenCalledTimes(2);
    expect(readStoredRowsMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a route declared for the map tracker alone, a pass-through route, and a holder the route is not held by', async () => {
    await expect(esiPassThrough('/characters/{character_id}/skills/', { character_id: 1 })).rejects.toThrow(
      'ESI route /characters/{character_id}/skills/ is not declared pass-through',
    );
    await expect(
      fetchStored({ route: '/universe/structures/{structure_id}/', holder: { kind: 'global' }, params: { structure_id: 1 } }, AS_IS),
    ).rejects.toThrow('ESI route /universe/structures/{structure_id}/ is declared pass-through, not stored');
    await expect(fetchStored({ route: '/characters/{character_id}/skills/', holder: { kind: 'global' } }, AS_IS)).rejects.toThrow(
      'ESI route /characters/{character_id}/skills/ is held by character, not global',
    );
    expect(esiFetchMock).not.toHaveBeenCalled();
  });
});

const priceKeyOf = (typeId: number): EsiStoreKey => ({ ...PRICE_KEY, params: { region_id: 10000002, type_id: typeId } });

describe('fetchStoredMany', () => {
  it('reads every key in one row read, calls only the expired ones, and answers in key order', async () => {
    const keys = [priceKeyOf(34), priceKeyOf(35), priceKeyOf(36), priceKeyOf(37)];
    rows(stored(NOW + 60_000), stored(NOW - 1, ['"e35"']), null, stored(NOW - 1));
    esiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('type_id=35')) return response(304, { Expires: EXPIRES, 'Last-Modified': MODIFIED });
      if (url.includes('type_id=36')) return response(200, { ETag: '"new"', Expires: EXPIRES }, [1]);
      return response(404);
    });

    const answers = await fetchStoredMany(keys, { concurrency: 8, ...AS_IS });

    expect(readStoredRowsMock).toHaveBeenCalledTimes(1);
    expect(readStoredRowsMock).toHaveBeenCalledWith(keys);
    expect(esiFetchMock).toHaveBeenCalledTimes(3);
    expect(fetchHeaders(0).get('If-None-Match')).toBe('"e35"');
    expect(answers.map((answer) => answer.kind)).toEqual(['unchanged', 'unchanged', 'fresh', 'error']);
    expect(answers[0]).toEqual({ kind: 'unchanged', expiresAt: NOW + 60_000 });
    expect(answers[1]).toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(answers[2]).toMatchObject({ kind: 'fresh', meta: { key: keys[2], etags: ['"new"'], expiresAt: Date.parse(EXPIRES) } });
    expect(answers[3]).toEqual({ kind: 'error', status: 404 });
  });

  it('records every 304 in one write once the fan-out is done, and none when there was none', async () => {
    const keys = [priceKeyOf(34), priceKeyOf(35), priceKeyOf(36)];
    rows(stored(NOW - 1), stored(NOW - 1), stored(NOW - 1));
    esiFetchMock.mockImplementation(async (url: string) =>
      url.includes('type_id=36') ? response(200, { Expires: EXPIRES }) : response(304, { Expires: EXPIRES }),
    );

    await fetchStoredMany(keys, { concurrency: 8, ...AS_IS });

    expect(recordUnchangedManyMock).toHaveBeenCalledTimes(1);
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([
      { key: keys[0], expiresAt: Date.parse(EXPIRES), lastModified: null, checkedAt: NOW },
      { key: keys[1], expiresAt: Date.parse(EXPIRES), lastModified: null, checkedAt: NOW },
    ]);
    expect(recordResponsesMock).not.toHaveBeenCalled();

    recordUnchangedManyMock.mockClear();
    esiFetchMock.mockResolvedValue(response(200, { Expires: EXPIRES }));
    await fetchStoredMany(keys, { concurrency: 8, ...AS_IS });
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
  });

  it('keeps at most `concurrency` calls in flight', async () => {
    const keys = Array.from({ length: 10 }, (_unused, i) => priceKeyOf(100 + i));
    rows(...keys.map(() => stored(NOW - 1)));
    let inFlight = 0;
    let peak = 0;
    esiFetchMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return response(304, { Expires: EXPIRES });
    });

    const run = fetchStoredMany(keys, { concurrency: 3, ...AS_IS });
    await vi.runAllTimersAsync();
    await run;

    expect(esiFetchMock).toHaveBeenCalledTimes(10);
    expect(peak).toBe(3);
  });

  it('keeps a thrown call to its own key, and once the budget refuses one spares the rest the call', async () => {
    const keys = [priceKeyOf(34), priceKeyOf(35), priceKeyOf(36), priceKeyOf(37)];
    rows(stored(NOW - 1), stored(NOW - 1), stored(NOW - 1), stored(NOW - 1));
    const refusal = new EsiBudgetExhaustedError(0);
    esiFetchMock
      .mockRejectedValueOnce(new EsiServerError(503))
      .mockResolvedValueOnce(response(304, { Expires: EXPIRES }))
      .mockRejectedValueOnce(refusal);

    const answers = await fetchStoredMany(keys, { concurrency: 1, ...AS_IS });

    expect(esiFetchMock).toHaveBeenCalledTimes(3);
    expect(answers[0]).toMatchObject({ kind: 'failed', error: expect.any(EsiServerError) });
    expect(answers[1]).toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(answers[2]).toEqual({ kind: 'failed', error: refusal });
    expect(answers[3]).toEqual({ kind: 'failed', error: refusal });
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([
      { key: keys[1], expiresAt: Date.parse(EXPIRES), lastModified: null, checkedAt: NOW },
    ]);
  });

  it('parses each 200 inside its own call, so no answer waits unread for the rest of the batch', async () => {
    const keys = [priceKeyOf(34), priceKeyOf(35)];
    rows(stored(NOW - 1), stored(NOW - 1));
    const bodies: Response[] = [];
    let releaseSecond: () => void = () => {};
    esiFetchMock.mockImplementationOnce(async () => {
      const res = response(200, { Expires: EXPIRES, 'X-Pages': '3' }, [34]);
      bodies.push(res);
      return res;
    });
    esiFetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { releaseSecond = () => resolve(response(200, { Expires: EXPIRES }, [35])); }),
    );
    const parse = vi.fn((body: unknown, headers: Headers) => ({ body, pages: headers.get('X-Pages') }));

    const run = fetchStoredMany(keys, { concurrency: 2, parse });
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    expect(bodies[0]!.bodyUsed).toBe(true);
    releaseSecond();
    const answers = await run;

    expect(answers[0]).toMatchObject({ kind: 'fresh', value: { body: [34], pages: '3' } });
    expect(answers[1]).toMatchObject({ kind: 'fresh', value: { body: [35], pages: null } });
    expect(answers[0]).not.toHaveProperty('res');
  });

  it('fails only the key whose body its parser refuses, and hands an error answer\'s body back unread', async () => {
    const keys = [priceKeyOf(34), priceKeyOf(35), priceKeyOf(36)];
    rows(stored(NOW - 1), stored(NOW - 1), stored(NOW - 1));
    const refused = response(404, {}, { error: 'not found' });
    esiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('type_id=35')) return response(200, { Expires: EXPIRES }, { not: 'a list' });
      if (url.includes('type_id=36')) return refused;
      return response(200, { Expires: EXPIRES }, [1]);
    });
    const contract = new Error('not a list');
    const parse = (body: unknown): unknown[] => {
      if (!Array.isArray(body)) throw contract;
      return body;
    };

    const answers = await fetchStoredMany(keys, { concurrency: 1, parse });

    expect(answers[0]).toMatchObject({ kind: 'fresh', value: [1] });
    expect(answers[1]).toEqual({ kind: 'failed', error: contract });
    expect(answers[2]).toEqual({ kind: 'error', status: 404 });
    expect(refused.bodyUsed).toBe(true);
    expect(esiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('answers nothing for no keys without reading, and refuses an undeclared holder before reading', async () => {
    await expect(fetchStoredMany([], { concurrency: 8, ...AS_IS })).resolves.toEqual([]);
    expect(readStoredRowsMock).not.toHaveBeenCalled();
    await expect(fetchStoredMany([{ ...SKILLS_KEY, holder: { kind: 'global' } }], { concurrency: 8, ...AS_IS })).rejects.toThrow(
      'is held by character, not global',
    );
    expect(readStoredRowsMock).not.toHaveBeenCalled();
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
    expect(recordResponsesMock).not.toHaveBeenCalled();
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
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

    await expect(readStoredAuthed(SKILLS_KEY, TOKEN, { rl })).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 120_000 });

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, '"held"', rl, undefined);
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([{ key: SKILLS_KEY, expiresAt: NOW + 120_000, lastModified: Date.parse(MODIFIED), checkedAt: NOW }]);
    expect(console.info).toHaveBeenCalledWith('[esi-store]', { route: SKILLS_KEY.route, holder: 'character', status: 'unchanged', cacheStatus: 'HIT' });
  });

  it('returns a fresh body with its meta and leaves the recording to commit', async () => {
    rows(null);
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'fresh', body: { total_sp: 1 }, etag: '"new"', expiresAt: null, lastModified: null, cacheStatus: 'MISS' });

    const result = await readStoredAuthed(SKILLS_KEY, TOKEN);

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, null, undefined, undefined);
    expect(result).toEqual({
      kind: 'fresh',
      body: { total_sp: 1 },
      etag: '"new"',
      meta: { key: SKILLS_KEY, expiresAt: NOW + 60_000, etags: ['"new"'], lastModified: null, checkedAt: NOW },
    });
    expect(recordResponsesMock).not.toHaveBeenCalled();
  });

  it('calls even while unexpired for a live read, still conditionally, and records a 304 like any other', async () => {
    rows(stored(NOW + 60_000));
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'unchanged', expiresAt: NOW + 120_000 });

    await expect(readStoredAuthed(SKILLS_KEY, TOKEN, { live: true, interactive: true })).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 120_000 });

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, '"held"', undefined, { interactive: true });
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([{ key: SKILLS_KEY, expiresAt: NOW + 120_000, lastModified: null, checkedAt: NOW }]);
  });

  it('drops the held ETag for a call the caller makes unconditional, so a row bound elsewhere cannot answer 304', async () => {
    rows(stored(NOW - 1, ['"old-corp"']));
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'fresh', body: { roles: [] }, etag: '"same"', expiresAt: null, lastModified: null, cacheStatus: 'MISS' });

    await expect(readStoredAuthed(SKILLS_KEY, TOKEN, { live: true, conditional: false })).resolves.toMatchObject({ kind: 'fresh', etag: '"same"' });

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/skills/', TOKEN, null, undefined, undefined);
  });

  it('never sends If-None-Match for the journal and passes an error through unrecorded', async () => {
    rows(stored(NOW - 1, ['"journal"']));
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });
    await expect(readStoredAuthed(JOURNAL_KEY, TOKEN)).resolves.toEqual({ kind: 'error', code: 'esi_403' });
    expect(readEsiAuthedMock).toHaveBeenCalledWith('/characters/91/wallet/journal/', TOKEN, null, undefined, undefined);
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
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
    expect(recordUnchangedManyMock).toHaveBeenCalledWith([{ key: ASSETS_KEY, expiresAt: NOW + 3_600_000, lastModified: null, checkedAt: NOW }]);
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

describe('pass-through authed reads', () => {
  const STRUCTURE_ROUTE = '/universe/structures/{structure_id}/';
  const NAMES_ROUTE = '/corporations/{corporation_id}/assets/names/';

  it('always calls without an ETag and records nothing', async () => {
    rows(stored(NOW + 60_000));
    readEsiAuthedMock.mockResolvedValueOnce({ kind: 'fresh', body: { name: 'Fort' }, etag: null, expiresAt: null });
    readEsiAuthedPostMock.mockResolvedValueOnce({ kind: 'fresh', body: [{ item_id: 1 }], etag: null, expiresAt: null });

    await expect(readPassThroughAuthed(STRUCTURE_ROUTE, { structure_id: 7 }, TOKEN)).resolves.toMatchObject({ kind: 'fresh', body: { name: 'Fort' } });
    await expect(postPassThroughAuthed(NAMES_ROUTE, { corporation_id: 98 }, TOKEN, [1])).resolves.toMatchObject({ kind: 'fresh' });

    expect(readEsiAuthedMock).toHaveBeenCalledWith('/universe/structures/7/', TOKEN, null);
    expect(readEsiAuthedPostMock).toHaveBeenCalledWith('/corporations/98/assets/names/', TOKEN, [1]);
    expect(readStoredRowsMock).not.toHaveBeenCalled();
    expect(recordResponsesMock).not.toHaveBeenCalled();
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
  });

  it('refuses a route that is not declared pass-through', async () => {
    await expect(readPassThroughAuthed(SKILLS_KEY.route, { character_id: 91 }, TOKEN)).rejects.toThrow('not declared pass-through');
    expect(readEsiAuthedMock).not.toHaveBeenCalled();
  });
});

describe('postStoredBatch', () => {
  it('always posts the batch and stamps the answer with its Expires, else the route\'s spec cache time', async () => {
    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES, 'Last-Modified': MODIFIED }, [{ character_id: 91 }]));
    const withExpires = await postStoredBatch('/characters/affiliation/', [91]);
    expect(withExpires.res.status).toBe(200);
    expect(withExpires.stamp).toEqual({ expiresAt: Date.parse(EXPIRES), lastModified: Date.parse(MODIFIED), checkedAt: NOW });
    expect(esiFetchMock).toHaveBeenCalledWith(
      'https://esi.evetech.net/characters/affiliation/',
      expect.objectContaining({ method: 'POST', body: '[91]' }),
      undefined,
    );
    expect(readStoredRowsMock).not.toHaveBeenCalled();

    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES }, []));
    await postStoredBatch('/characters/affiliation/', [93], { interactive: true });
    expect(esiFetchMock).toHaveBeenLastCalledWith(expect.any(String), expect.anything(), { interactive: true });

    esiFetchMock.mockResolvedValueOnce(response(404, {}, {}));
    const bare = await postStoredBatch('/characters/affiliation/', [92]);
    expect(bare.res.status).toBe(404);
    expect(bare.stamp).toEqual({ expiresAt: NOW + 3_600_000, lastModified: null, checkedAt: NOW });
    expect(recordResponsesMock).not.toHaveBeenCalled();
  });

  it('refuses a route that is not a stored POST', async () => {
    await expect(postStoredBatch(PRICE_KEY.route, [])).rejects.toThrow('not a stored POST');
    expect(esiFetchMock).not.toHaveBeenCalled();
  });
});

describe('datasetTag', () => {
  it('derives the tag from the stored declaration\'s dataset and the holder', () => {
    expect(datasetTag(SKILLS_KEY)).toBe('eve:skills:character:91');
    expect(datasetTag({ route: '/characters/{character_id}/location/', holder: { kind: 'character', id: 91 } })).toBe('eve:character_sheet_live:character:91');
    expect(datasetTag({ route: '/corporations/{corporation_id}/industry/jobs/', holder: { kind: 'user-corporation', id: 98, userId: 'u1' } }))
      .toBe('eve:corporation_industry_jobs:user-corporation:u1:98');
    expect(datasetTag(PRICE_KEY)).toBe('eve:market_prices');
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

  it('is due for a user only while both the stored answer and that user\'s own refusal of it have expired', async () => {
    rows(null, null, null, stored(NOW + 1000));
    await expect(isDueFor('u1', [SKILLS_KEY, ASSETS_KEY])).resolves.toBe(true);
    expect(readStoredRowsMock).toHaveBeenCalledExactlyOnceWith([SKILLS_KEY, ASSETS_KEY, SKILLS_KEY, refusalKeyFor('u1', ASSETS_KEY)]);
    rows(stored(NOW + 1000), null, stored(NOW + 1000), stored(NOW + 1000));
    await expect(isDueFor('u1', [SKILLS_KEY, ASSETS_KEY])).resolves.toBe(false);
    rows(stored(NOW + 1000), stored(NOW - 1), stored(NOW + 1000), stored(NOW - 1));
    await expect(isDueFor('u1', [SKILLS_KEY, ASSETS_KEY])).resolves.toBe(true);
  });

  it('puts a user\'s refusal of a corporation answer on a row of their own, and leaves every other key on its own row', () => {
    expect(refusalKeyFor('u1', ASSETS_KEY)).toEqual({ ...ASSETS_KEY, holder: { kind: 'user-corporation', id: 98, userId: 'u1' } });
    expect(refusalKeyFor('u1', SKILLS_KEY)).toBe(SKILLS_KEY);
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
    expect(recordResponsesMock).not.toHaveBeenCalled();
    expect(expireNowMock).not.toHaveBeenCalled();
  });

  it('fans one answer\'s expiry out to every key in one write, without its ETag or body', async () => {
    const meta = { key: PRICE_KEY, expiresAt: NOW + 300_000, etags: ['"dump"'], lastModified: NOW, checkedAt: NOW, body: { x: 1 } };
    const other: EsiStoreKey = { ...PRICE_KEY, params: { region_id: 10000002, type_id: 35 } };
    await recordExpiryFor([PRICE_KEY, other], meta);
    expect(recordResponsesMock).toHaveBeenCalledTimes(1);
    expect(recordResponsesMock).toHaveBeenCalledWith([
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

  it('serves the stored copy of a public batch, and fails every due authed read with a 503, while the status row says halted', async () => {
    vi.setSystemTime(IN_WINDOW);
    readStoredRowsMock.mockImplementation((keys: EsiStoreKey[]) =>
      Promise.resolve(keys.map((key) => (key.route === '/status/' ? haltedStatusRow : stored(IN_WINDOW - 1)))),
    );

    await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW - 1 });
    // An owner stamped fresh from an unchecked "unchanged" would read as refreshed now, so a due authed read fails like ESI would.
    await expect(readStoredAuthed(SKILLS_KEY, TOKEN)).rejects.toBeInstanceOf(EsiServerError);
    await expect(readStoredPaged(ASSETS_KEY, TOKEN)).rejects.toBeInstanceOf(EsiServerError);
    await expect(postStored(AFFILIATION_KEY, TOKEN, [91])).rejects.toBeInstanceOf(EsiServerError);
    expect(recordUnchangedManyMock).not.toHaveBeenCalled();
    await expect(esiPassThrough('/universe/structures/{structure_id}/', { structure_id: 1 })).rejects.toBeInstanceOf(EsiServerError);
    await expect(readPassThroughAuthed('/universe/structures/{structure_id}/', { structure_id: 1 }, TOKEN)).rejects.toBeInstanceOf(EsiServerError);
    await expect(postStoredBatch('/characters/affiliation/', [91])).rejects.toBeInstanceOf(EsiServerError);
    expect(esiFetchMock).not.toHaveBeenCalled();
    expect(readEsiAuthedMock).not.toHaveBeenCalled();
    expect(readEsiPagedAuthedMock).not.toHaveBeenCalled();
    expect(readEsiAuthedPostMock).not.toHaveBeenCalled();
  });

  it('still answers an unexpired authed read from its stored copy under the halt', async () => {
    vi.setSystemTime(IN_WINDOW);
    readStoredRowsMock.mockImplementation((keys: EsiStoreKey[]) =>
      Promise.resolve(keys.map((key) => (key.route === '/status/' ? haltedStatusRow : stored(IN_WINDOW + 60_000)))),
    );

    await expect(readStoredAuthed(SKILLS_KEY, TOKEN)).resolves.toEqual({ kind: 'unchanged', expiresAt: IN_WINDOW + 60_000 });
    expect(readEsiAuthedMock).not.toHaveBeenCalled();
  });

  it('lets the status probe itself through the halt', async () => {
    vi.setSystemTime(IN_WINDOW + 25_000);
    readStoredRowsMock.mockResolvedValue([haltedStatusRow]);
    esiFetchMock.mockResolvedValueOnce(response(200, { Expires: EXPIRES }, { players: 0 }));

    await expect(fetchStored(STATUS_KEY, AS_IS)).resolves.toMatchObject({ kind: 'fresh' });
    expect(esiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads no status row outside the window, and ignores a stale halt once 11:30 has passed', async () => {
    vi.setSystemTime(NOW);
    rows(stored(NOW - 1));
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await fetchStored(PRICE_KEY, AS_IS);
    expect(readStoredRowsMock.mock.calls.every(([keys]) => (keys as EsiStoreKey[]).every((key) => key.route !== '/status/'))).toBe(true);

    vi.setSystemTime(HALT_UNTIL);
    readStoredRowsMock.mockImplementation((keys: EsiStoreKey[]) =>
      Promise.resolve(keys.map((key) => (key.route === '/status/' ? haltedStatusRow : stored(HALT_UNTIL - 1)))),
    );
    esiFetchMock.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
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
    expect(recordResponsesMock).toHaveBeenCalledWith([meta]);
    expect(expireNowMock).not.toHaveBeenCalled();
  });

  it('gives a 503 the expiry it sent, else the route\'s spec cache time, and no ETag', () => {
    const withExpires = serverErrorMeta(STATUS_KEY, new EsiServerError(503, null, { expires: EXPIRES }), NOW);
    expect(withExpires).toEqual({ key: STATUS_KEY, expiresAt: Date.parse(EXPIRES), etags: [], lastModified: null, checkedAt: NOW });
    const bare = serverErrorMeta(STATUS_KEY, new EsiServerError(503), NOW);
    expect(bare.expiresAt).toBe(NOW + 30_000);
  });
});

describe('recordRefusal and refusalMeta', () => {
  it('records a refusal as each due key\'s answer with no ETag, until its Expires or else the route\'s spec cache time', async () => {
    rows(null, stored(NOW - 1));
    await recordRefusalFor('u1', [SKILLS_KEY, ASSETS_KEY], null);
    expect(recordResponsesMock).toHaveBeenCalledExactlyOnceWith([
      { key: SKILLS_KEY, expiresAt: NOW + 60_000, etags: [], lastModified: null, checkedAt: NOW },
      { key: refusalKeyFor('u1', ASSETS_KEY), expiresAt: NOW + 3_600_000, etags: [], lastModified: null, checkedAt: NOW },
    ]);
    expect(expireNowMock).not.toHaveBeenCalled();

    recordResponsesMock.mockClear();
    rows(stored(null));
    await recordRefusal([SKILLS_KEY], NOW + 90_000);
    expect(recordResponsesMock).toHaveBeenCalledExactlyOnceWith([
      { key: SKILLS_KEY, expiresAt: NOW + 90_000, etags: [], lastModified: null, checkedAt: NOW },
    ]);
  });

  it('leaves a key whose stored answer still stands, and writes nothing when none is due', async () => {
    rows(stored(NOW + 5_000), null);
    await recordRefusalFor('u1', [SKILLS_KEY, ASSETS_KEY], NOW + 90_000);
    expect(recordResponsesMock).toHaveBeenCalledExactlyOnceWith([
      { key: refusalKeyFor('u1', ASSETS_KEY), expiresAt: NOW + 90_000, etags: [], lastModified: null, checkedAt: NOW },
    ]);

    recordResponsesMock.mockClear();
    rows(stored(NOW + 5_000));
    await recordRefusal([SKILLS_KEY], null);
    expect(recordResponsesMock).not.toHaveBeenCalled();
  });

  it('will not record a refusal on a corporation\'s shared row', async () => {
    await expect(recordRefusal([SKILLS_KEY, ASSETS_KEY], null)).rejects.toThrow(/shared by a corporation/);
    expect(readStoredRowsMock).not.toHaveBeenCalled();
    expect(recordResponsesMock).not.toHaveBeenCalled();
  });

  it('builds a refusal\'s meta from the route\'s declaration and refuses an undeclared holder', () => {
    expect(refusalMeta(SKILLS_KEY, null, NOW)).toEqual({ key: SKILLS_KEY, expiresAt: NOW + 60_000, etags: [], lastModified: null, checkedAt: NOW });
    expect(() => refusalMeta({ ...SKILLS_KEY, holder: { kind: 'global' } }, null, NOW)).toThrow(/held by character/);
  });
});

describe('forgetStored', () => {
  it('deletes the rows of the keys it is given, so each is due and reads unconditionally next', async () => {
    await forgetStored([SKILLS_KEY, ASSETS_KEY]);
    expect(deleteStoredRowsMock).toHaveBeenCalledExactlyOnceWith([SKILLS_KEY, ASSETS_KEY]);
  });
});
