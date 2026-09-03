import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { fetchAffiliations } from './affiliation-source';

const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null, etag: null };
  },
  async budgetSnapshot() {
    return { effectiveRemaining: 1000, selfCount: 0, echo: null, source: 'process-local' as const };
  },
  async report() {},
  async getCachedBody() {
    return null;
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __setScoreboardForTests(permissiveScoreboard);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetEsiGateForTests();
});

describe('fetchAffiliations', () => {
  it('returns an empty completed result for empty input without calling ESI', async () => {
    await expect(fetchAffiliations([])).resolves.toEqual({
      rows: [],
      transientFailure: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the de-duplicated id array to /characters/affiliation/ and maps the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { character_id: 101, corporation_id: 2000, alliance_id: 99, faction_id: 500 },
        { character_id: 102, corporation_id: 3000 },
      ]),
    );

    const result = await fetchAffiliations([101, 102, 101]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/characters/affiliation/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([101, 102]);
    expect(result).toEqual({
      rows: [
        { characterId: 101, corporationId: 2000, allianceId: 99, factionId: 500 },
        { characterId: 102, corporationId: 3000, allianceId: null, factionId: null },
      ],
      transientFailure: false,
    });
  });

  it('chunks at 1000 ids per request', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([])));
    const ids = Array.from({ length: 1500 }, (_, i) => i + 1);

    await fetchAffiliations(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toHaveLength(1000);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toHaveLength(500);
  });

  it('bisects a mixed 404 batch so live characters still refresh', async () => {
    fetchMock.mockImplementation(async (_url: unknown, init: { body: string }) => {
      const ids = JSON.parse(init.body) as number[];
      if (ids.includes(101) && ids.includes(102)) {
        return new Response('not found', { status: 404 });
      }
      if (ids.length === 1 && ids[0] === 101) {
        return new Response('not found', { status: 404 });
      }
      if (ids.length === 1 && ids[0] === 102) {
        return jsonResponse([{ character_id: 102, corporation_id: 3000 }]);
      }
      return jsonResponse([]);
    });

    const result = await fetchAffiliations([101, 102]);

    expect(result).toEqual({
      rows: [{ characterId: 102, corporationId: 3000, allianceId: null, factionId: null }],
      transientFailure: false,
    });
  });

  it('treats a single-id 404 as completed with omissions, not transient', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(fetchAffiliations([101])).resolves.toEqual({
      rows: [],
      transientFailure: false,
    });
  });

  it('marks a budget refusal as transient without throwing', async () => {
    __setScoreboardForTests('unavailable');
    await expect(fetchAffiliations([101])).resolves.toEqual({
      rows: [],
      transientFailure: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks a 5xx as transient without throwing', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));
    await expect(fetchAffiliations([101])).resolves.toEqual({
      rows: [],
      transientFailure: true,
    });
  });

  it('marks a body that fails the contract parse as transient', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ character_id: 'bad' }]));
    await expect(fetchAffiliations([101])).resolves.toEqual({
      rows: [],
      transientFailure: true,
    });
  });

  it('in development, omits the local synthetic E2E character before calling ESI', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await expect(fetchAffiliations([9_000_001])).resolves.toEqual({
      rows: [],
      transientFailure: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      jsonResponse([{ character_id: 102, corporation_id: 3000 }]),
    );
    const result = await fetchAffiliations([9_000_001, 102]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([102]);
    expect(result).toEqual({
      rows: [{ characterId: 102, corporationId: 3000, allianceId: null, factionId: null }],
      transientFailure: false,
    });
  });

  it('in production, still sends every id and treats ESI 400 as transient', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid character ID' }), { status: 400 }),
    );

    await expect(fetchAffiliations([9_000_001, 102])).resolves.toEqual({
      rows: [],
      transientFailure: true,
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([9_000_001, 102]);
  });
});
