import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { fetchAffiliations } from './affiliation-source';

// Drive the REAL gate (so the real esiFetch + error classes are exercised, with
// no mock-boundary instanceof pitfalls): a permissive scoreboard lets calls
// dispatch to a stubbed global fetch; 'unavailable' makes the gate fail closed.
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
  __resetEsiGateForTests();
});

describe('fetchAffiliations', () => {
  it('returns [] for empty input without calling ESI', async () => {
    expect(await fetchAffiliations([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the de-duplicated id array to /characters/affiliation/ and maps the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { character_id: 101, corporation_id: 2000, alliance_id: 99, faction_id: 500 },
        { character_id: 102, corporation_id: 3000 },
      ]),
    );

    const rows = await fetchAffiliations([101, 102, 101]); // 101 duplicated

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/characters/affiliation/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([101, 102]); // deduped, order preserved
    expect(rows).toEqual([
      { characterId: 101, corporationId: 2000, allianceId: 99, factionId: 500 },
      // alliance/faction absent ⇒ null
      { characterId: 102, corporationId: 3000, allianceId: null, factionId: null },
    ]);
  });

  it('chunks at 1000 ids per request', async () => {
    // Fresh Response per call — a shared one would have its body read twice.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([])));
    const ids = Array.from({ length: 1500 }, (_, i) => i + 1);

    await fetchAffiliations(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2); // ceil(1500 / 1000)
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toHaveLength(1000);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toHaveLength(500);
  });

  it('skips an all-or-nothing batch failure (404) but keeps surviving batches', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 })) // chunk 1: one bad id
      .mockResolvedValueOnce(jsonResponse([{ character_id: 1500, corporation_id: 2000 }]));
    const ids = Array.from({ length: 1500 }, (_, i) => i + 1);

    const rows = await fetchAffiliations(ids);

    expect(rows).toEqual([
      { characterId: 1500, corporationId: 2000, allianceId: null, factionId: null },
    ]);
  });

  it('skips a batch on a budget refusal without throwing (no dispatch)', async () => {
    __setScoreboardForTests('unavailable'); // gate fails closed → esiFetch throws budget
    expect(await fetchAffiliations([101])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a batch on a 5xx without throwing', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));
    expect(await fetchAffiliations([101])).toEqual([]);
  });

  it('skips a batch whose body fails the contract parse', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ character_id: 'bad' }]));
    expect(await fetchAffiliations([101])).toEqual([]);
  });
});
