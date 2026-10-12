import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { fetchAffiliations } from './affiliation-source';
import { SYNTHETIC_PILOT } from './synthetic-pilot';

// The downtime halt reads the status row only inside the 10:55-11:30 UTC window; keep the unit test off the database.
vi.mock('@/data/esi-store/halt', () => ({ esiHalted: async () => false }));

const NOW = Date.parse('2026-10-12T12:00:00Z');
const EXPIRES = 'Mon, 12 Oct 2026 12:05:00 GMT';
/** The stamp a batch without Expires takes: the route's published cache time counted from the call. */
const SPEC_STAMP = { expiresAt: NOW + 3_600_000, lastModified: null, checkedAt: NOW };

const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null };
  },
  async budgetSnapshot() {
    return { effectiveRemaining: 1000, selfCount: 0, echo: null, source: 'process-local' as const };
  },
  async availabilitySnapshot() {
    return { calls: 0, failures: 0, source: 'process-local' as const };
  },
  async report() {},
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  __setScoreboardForTests(permissiveScoreboard);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetEsiGateForTests();
});

test('skips ESI for empty input, POSTs de-duplicated ids, maps the response under CCP\'s expiry, and chunks at 1000', async () => {
  await expect(fetchAffiliations([])).resolves.toEqual({
    rows: [],
    transientFailure: false,
    answers: [],
  });
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(
    Response.json([
      { character_id: 101, corporation_id: 2000, alliance_id: 99, faction_id: 500 },
      { character_id: 102, corporation_id: 3000 },
    ], { headers: { Expires: EXPIRES } }),
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
    answers: [{ characterIds: [101, 102], stamp: { expiresAt: Date.parse(EXPIRES), lastModified: null, checkedAt: NOW } }],
  });

  fetchMock.mockImplementation(() => Promise.resolve(Response.json([{ character_id: 1, corporation_id: 1 }])));
  const ids = Array.from({ length: 1500 }, (_, i) => i + 1);

  const chunked = await fetchAffiliations(ids);
  expect(chunked.answers.map((answer) => answer.characterIds.length)).toEqual([1000, 500]);

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toHaveLength(1000);
  expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toHaveLength(500);
});

test('bisects mixed 404s so live characters refresh, confirms single-id 404s as departures, and omits unexpected response IDs', async () => {
  fetchMock.mockImplementation(async (_url: unknown, init: { body: string }) => {
    const ids = JSON.parse(init.body) as number[];
    if (ids.includes(101) && ids.includes(102)) {
      return new Response('not found', { status: 404 });
    }
    if (ids.length === 1 && ids[0] === 101) {
      return new Response('not found', { status: 404 });
    }
    if (ids.length === 1 && ids[0] === 102) {
      return Response.json([{ character_id: 102, corporation_id: 3000 }]);
    }
    return Response.json([]);
  });

  await expect(fetchAffiliations([101, 102])).resolves.toEqual({
    rows: [
      { characterId: 101, corporationId: null, allianceId: null, factionId: null },
      { characterId: 102, corporationId: 3000, allianceId: null, factionId: null },
    ],
    transientFailure: false,
    // A single-id 404 is an answer too, so the departed character's key takes the route's cache time like any other.
    answers: [{ characterIds: [101], stamp: SPEC_STAMP }, { characterIds: [102], stamp: SPEC_STAMP }],
  });

  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(Response.json([{ character_id: 999, corporation_id: 3000 }]));
  await expect(fetchAffiliations([101])).resolves.toEqual({
    rows: [{ characterId: 101, corporationId: null, allianceId: null, factionId: null }],
    transientFailure: false,
    answers: [{ characterIds: [101], stamp: SPEC_STAMP }],
  });
});

test.each([
  ['departure', '503'],
  ['departure', 'timeout'],
  ['changed corporation', '503'],
  ['changed corporation', 'timeout'],
] as const)(
  'preserves a confirmed %s when the other recursive half fails with %s',
  async (confirmed, failure) => {
    fetchMock.mockImplementation(async (_url: unknown, init: { body: string }) => {
      const ids = JSON.parse(init.body) as number[];
      if (ids.length > 1) return new Response('not found', { status: 404 });
      if (ids[0] === 101) {
        return confirmed === 'departure'
          ? new Response('not found', { status: 404 })
          : Response.json([{ character_id: 101, corporation_id: 3000 }]);
      }
      if (failure === 'timeout') throw new DOMException('signal timed out', 'TimeoutError');
      return new Response('unavailable', { status: 503 });
    });

    await expect(fetchAffiliations([101, 102])).resolves.toEqual({
      rows: [{
        characterId: 101,
        corporationId: confirmed === 'departure' ? null : 3000,
        allianceId: null,
        factionId: null,
      }],
      transientFailure: true,
      answers: [{ characterIds: [101], stamp: SPEC_STAMP }],
    });
  },
);

test.each(['503', 'network', 'timeout', 'invalid JSON'] as const)(
  'preserves confirmed top-level batch results when another batch fails with %s',
  async (failure) => {
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    fetchMock.mockImplementation(async (_url: unknown, init: { body: string }) => {
      const batch = JSON.parse(init.body) as number[];
      if (batch.length === 1000) {
        return Response.json([{ character_id: 1, corporation_id: 3000 }]);
      }
      if (failure === 'network') throw new TypeError('fetch failed');
      if (failure === 'timeout') throw new DOMException('signal timed out', 'TimeoutError');
      if (failure === 'invalid JSON') return new Response('broken JSON', { status: 200 });
      return new Response('unavailable', { status: 503 });
    });

    const result = await fetchAffiliations(ids);
    expect(result.transientFailure).toBe(true);
    expect(result.rows).toHaveLength(1000);
    expect(result.rows[0]).toEqual({
      characterId: 1, corporationId: 3000, allianceId: null, factionId: null,
    });
    expect(result.rows[999]).toEqual({
      characterId: 1000, corporationId: null, allianceId: null, factionId: null,
    });
    expect(result.rows.some((row) => row.characterId === 1001)).toBe(false);
  },
);

test('marks budget, 5xx, empty-200, and unparseable bodies as transient, but unexpected dispatch errors still throw', async () => {
  const transient = { rows: [], transientFailure: true, answers: [] };
  __setScoreboardForTests('unavailable');
  await expect(fetchAffiliations([101])).resolves.toEqual(transient);
  expect(fetchMock).not.toHaveBeenCalled();

  __setScoreboardForTests(permissiveScoreboard);
  fetchMock.mockResolvedValueOnce(new Response('boom', { status: 503 }));
  await expect(fetchAffiliations([101])).resolves.toEqual(transient);

  fetchMock.mockResolvedValueOnce(Response.json([]));
  await expect(fetchAffiliations([101, 102])).resolves.toEqual(transient);

  fetchMock.mockResolvedValueOnce(Response.json([{ character_id: 'bad' }]));
  await expect(fetchAffiliations([101])).resolves.toEqual(transient);

  fetchMock.mockRejectedValueOnce(new Error('programmer bug'));
  await expect(fetchAffiliations([101])).rejects.toThrow('programmer bug');
});

test('in development, omits the local synthetic E2E character before calling ESI; production still sends every id and treats ESI 400 as transient', async () => {
  vi.stubEnv('NODE_ENV', 'development');

  await expect(fetchAffiliations([SYNTHETIC_PILOT.characterId])).resolves.toEqual({
    rows: [],
    transientFailure: false,
    answers: [],
  });
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(
    Response.json([{ character_id: 102, corporation_id: 3000 }]),
  );
  const result = await fetchAffiliations([SYNTHETIC_PILOT.characterId, 102]);
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([102]);
  expect(result).toEqual({
    rows: [{ characterId: 102, corporationId: 3000, allianceId: null, factionId: null }],
    transientFailure: false,
    answers: [{ characterIds: [102], stamp: SPEC_STAMP }],
  });

  vi.stubEnv('NODE_ENV', 'production');
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'Invalid character ID' }, { status: 400 }),
  );

  await expect(fetchAffiliations([SYNTHETIC_PILOT.characterId, 102])).resolves.toEqual({
    rows: [],
    transientFailure: true,
    answers: [],
  });
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual([
    SYNTHETIC_PILOT.characterId,
    102,
  ]);
});
