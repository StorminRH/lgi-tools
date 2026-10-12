import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGED_READ_CONCURRENCY, readEsiAuthed, readEsiAuthedPost, readEsiPagedAuthed, type RlSnapshot } from './authed-read';
import { __resetEsiGateForTests } from './index';

const TOKEN = 'access-token-xyz';

function mockResponse(
  status: number,
  headers: Record<string, string> = {},
  body: unknown = {},
): Response {
  if (status === 304) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers });
}

function authHeader(fetchSpy: ReturnType<typeof vi.spyOn>, call: number): Headers {
  const init = fetchSpy.mock.calls[call][1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('readEsiAuthed', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns fresh body + etag + expires on 200, carrying the bearer token', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        200,
        {
          ETag: '"abc"',
          Expires: 'Wed, 11 Jun 2026 12:00:00 GMT',
          'Last-Modified': 'Wed, 11 Jun 2026 11:00:00 GMT',
          'X-ESI-Cache-Status': 'MISS',
        },
        { roles: ['Director'] },
      ),
    );

    const read = await readEsiAuthed('/characters/1/roles', TOKEN, null);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.body).toEqual({ roles: ['Director'] });
    expect(read.etag).toBe('"abc"');
    expect(read.expiresAt).toBe(Date.parse('Wed, 11 Jun 2026 12:00:00 GMT'));
    expect(read.lastModified).toBe('Wed, 11 Jun 2026 11:00:00 GMT');
    expect(read.cacheStatus).toBe('MISS');
    expect(authHeader(fetchSpy, 0).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('replays the held etag and maps a 304 to unchanged with its cache headers', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(304, {
        Expires: 'Wed, 11 Jun 2026 12:05:00 GMT',
        'Last-Modified': 'Wed, 11 Jun 2026 11:00:00 GMT',
        'X-ESI-Cache-Status': 'HIT',
      }),
    );

    const read = await readEsiAuthed('/characters/1/roles', TOKEN, '"held"');

    expect(read).toEqual({
      kind: 'unchanged',
      expiresAt: Date.parse('Wed, 11 Jun 2026 12:05:00 GMT'),
      lastModified: 'Wed, 11 Jun 2026 11:00:00 GMT',
      cacheStatus: 'HIT',
    });
    expect(authHeader(fetchSpy, 0).get('If-None-Match')).toBe('"held"');
  });

  it('leaves the cache headers null when ESI sends none', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"abc"' }, { online: true }));

    await expect(readEsiAuthed('/characters/1/online', TOKEN, null)).resolves.toEqual({
      kind: 'fresh',
      body: { online: true },
      etag: '"abc"',
      expiresAt: null,
      lastModified: null,
      cacheStatus: null,
    });
  });

  it('maps a 403 to a soft error (a missing in-game role)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(403));

    const read = await readEsiAuthed('/corporations/2/blueprints/', TOKEN, null);

    expect(read).toEqual({ kind: 'error', code: 'esi_403' });
  });

  it('harvests the rate-limit headers into the snapshot when one is supplied', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        200,
        {
          ETag: '"abc"',
          'X-Ratelimit-Group': 'char-online',
          'X-Ratelimit-Limit': '600',
          'X-Ratelimit-Remaining': '598',
          'X-Ratelimit-Used': '2',
        },
        { online: true },
      ),
    );
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };

    await readEsiAuthed('/characters/1/online', TOKEN, null, rl);

    expect(rl).toEqual({ rlGroup: 'char-online', rlLimit: 600, rlRemaining: 598, rlUsed: 2 });
  });

  it('leaves the snapshot untouched when the response carries no rate-limit group', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"abc"' }, { online: true }));
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };

    await readEsiAuthed('/characters/1/online', TOKEN, null, rl);

    expect(rl).toEqual({ rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null });
  });

  it('posts a JSON body with the bearer token and returns the fresh reply', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, {}, [{ item_id: 3001, name: 'Ore Can' }]));

    const read = await readEsiAuthedPost('/corporations/2/assets/names/', TOKEN, [3001]);

    expect(read).toEqual({
      kind: 'fresh',
      body: [{ item_id: 3001, name: 'Ore Can' }],
      etag: null,
      expiresAt: null,
      lastModified: null,
      cacheStatus: null,
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('[3001]');
    expect(authHeader(fetchSpy, 0).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(authHeader(fetchSpy, 0).get('content-type')).toBe('application/json');
  });

  it('maps a failed POST to the same soft error shape as a GET', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(403));

    await expect(readEsiAuthedPost('/corporations/2/assets/names/', TOKEN, [3001])).resolves.toEqual({
      kind: 'error',
      code: 'esi_403',
    });
  });
});

describe('readEsiPagedAuthed', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the single page flattened with its etag', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        200,
        {
          'Cache-Control': 'private, max-age=3600',
          ETag: '"p1"',
          'Last-Modified': 'Tue, 14 Jul 2026 12:00:00 GMT',
          'X-ESI-Cache-Status': 'MISS',
          'X-Pages': '1',
        },
        [{ type_id: 10 }],
      ),
    );

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, []);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.items).toEqual([{ type_id: 10 }]);
    expect(read.etags).toEqual(['"p1"']);
    expect(read.lastModified).toBe('Tue, 14 Jul 2026 12:00:00 GMT');
    expect(read.cacheStatus).toBe('MISS');
    expect(read.responseHeaders).toEqual([
      {
        page: 1,
        cacheControl: 'private, max-age=3600',
        etag: '"p1"',
        lastModified: 'Tue, 14 Jul 2026 12:00:00 GMT',
        xPages: 1,
      },
    ]);
  });

  it('short-circuits a single-page 304 to unchanged when the held etag still matches', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(304, { 'X-Pages': '1', 'X-ESI-Cache-Status': 'HIT' }));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, ['"held"']);

    expect(read).toEqual({ kind: 'unchanged', expiresAt: null, lastModified: null, cacheStatus: 'HIT' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(authHeader(fetchSpy, 0).get('If-None-Match')).toBe('"held"');
  });

  it('reassembles every page fresh for a multi-page collection, with page 1 speaking for the cache headers', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(200, { 'X-Pages': '2', 'X-ESI-Cache-Status': 'MISS' }, [{ type_id: 1 }]))
      .mockResolvedValueOnce(mockResponse(200, { 'X-ESI-Cache-Status': 'HIT' }, [{ type_id: 2 }]));

    const read = await readEsiPagedAuthed('/corporations/9/blueprints/', TOKEN, []);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.items).toEqual([{ type_id: 1 }, { type_id: 2 }]);
    expect(read.cacheStatus).toBe('MISS');
    expect(read.responseHeaders.map((headers) => headers.page)).toEqual([1, 2]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain('page=2');
  });

  it('keeps at most PAGED_READ_CONCURRENCY pages in flight after page 1', async () => {
    let inFlight = 0;
    let peak = 0;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const page = Number(/page=(\d+)/.exec(String(input))?.[1] ?? '1');
      if (page === 1) return mockResponse(200, { 'X-Pages': '21' }, [{ page }]);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return mockResponse(200, {}, [{ page }]);
    });

    const read = await readEsiPagedAuthed('/corporations/9/assets/', TOKEN, []);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.items).toHaveLength(21);
    expect(read.responseHeaders.map((headers) => headers.page)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(fetchSpy).toHaveBeenCalledTimes(21);
    expect(peak).toBe(PAGED_READ_CONCURRENCY);
    expect(PAGED_READ_CONCURRENCY).toBe(8);
  });

  it('propagates a page-1 4xx as an error', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404, { 'X-Pages': '1' }));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, []);

    expect(read).toEqual({ kind: 'error', code: 'esi_404' });
  });

  it('treats a non-array body as a contract error', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"p1"', 'X-Pages': '1' }, { not: 'an array' }));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, []);

    expect(read).toEqual({ kind: 'error', code: 'contract_error' });
  });
});
