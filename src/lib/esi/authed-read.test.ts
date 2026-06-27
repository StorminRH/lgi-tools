import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEsiAuthed, readEsiPagedAuthed } from './authed-read';
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
    // Pin the in-process scoreboard path (esiFetch's budget gate) even if a local
    // `vercel env pull` left Upstash creds around — mirrors index.test.ts.
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns fresh body + etag + expires on 200, carrying the bearer token', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { ETag: '"abc"', Expires: 'Wed, 11 Jun 2026 12:00:00 GMT' }, { roles: ['Director'] }),
    );

    const read = await readEsiAuthed('/characters/1/roles', TOKEN, null);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.body).toEqual({ roles: ['Director'] });
    expect(read.etag).toBe('"abc"');
    expect(read.expiresAt).toBe(Date.parse('Wed, 11 Jun 2026 12:00:00 GMT'));
    expect(authHeader(fetchSpy, 0).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('replays the held etag and maps a 304 to unchanged', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(304));

    const read = await readEsiAuthed('/characters/1/roles', TOKEN, '"held"');

    expect(read.kind).toBe('unchanged');
    expect(authHeader(fetchSpy, 0).get('If-None-Match')).toBe('"held"');
  });

  it('maps a 403 to a soft error (a missing in-game role)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(403));

    const read = await readEsiAuthed('/corporations/2/blueprints/', TOKEN, null);

    expect(read).toEqual({ kind: 'error', code: 'esi_403' });
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
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the single page flattened with its etag', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"p1"', 'X-Pages': '1' }, [{ type_id: 10 }]));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, []);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.items).toEqual([{ type_id: 10 }]);
    expect(read.etags).toEqual(['"p1"']);
  });

  it('short-circuits a single-page 304 to unchanged when the held etag still matches', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(304, { 'X-Pages': '1' }));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, ['"held"']);

    expect(read).toEqual({ kind: 'unchanged', expiresAt: null });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(authHeader(fetchSpy, 0).get('If-None-Match')).toBe('"held"');
  });

  it('reassembles every page fresh for a multi-page collection', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(200, { 'X-Pages': '2' }, [{ type_id: 1 }]))
      .mockResolvedValueOnce(mockResponse(200, {}, [{ type_id: 2 }]));

    const read = await readEsiPagedAuthed('/corporations/9/blueprints/', TOKEN, []);

    expect(read.kind).toBe('fresh');
    if (read.kind !== 'fresh') return;
    expect(read.items).toEqual([{ type_id: 1 }, { type_id: 2 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Page 2 is requested with the ?page= cursor appended.
    expect(String(fetchSpy.mock.calls[1][0])).toContain('page=2');
  });

  it('propagates a page-1 4xx as an error', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404, { 'X-Pages': '1' }));

    const read = await readEsiPagedAuthed('/characters/1/blueprints/', TOKEN, []);

    expect(read).toEqual({ kind: 'error', code: 'esi_404' });
  });
});
