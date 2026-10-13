import { revalidateTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { __resetEsiGateForTests, EsiServerError } from '@/platform/esi';
import {
  commit,
  commitWithWrite,
  datasetTag,
  fetchStored,
  fetchStoredMany,
  isDue,
  isDueFor,
  readStoredAuthed,
  recordExpiryFor,
  recordRefusal,
  recordRefusalFor,
  refusalKeyFor,
  storedExpiry,
} from './index';
import { esiResponses } from './schema';
import { esiStorePurgeContributor } from './purge';
import { identityText, rowIdentity } from './key';
import type { EsiStoreKey } from './types';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const harness = await createDbTestHarness({
  schema: 'test_esi_store',
  tables: ['esi_responses'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const NOW = Date.now();
const EXPIRES = new Date(NOW + 300_000).toUTCString();
const PRICE_KEY: EsiStoreKey = {
  route: '/markets/{region_id}/orders/',
  holder: { kind: 'global' },
  params: { region_id: 10000002, type_id: 34 },
};
const OTHER_PRICE_KEY: EsiStoreKey = { ...PRICE_KEY, params: { region_id: 10000002, type_id: 35 } };
const SKILLS_KEY: EsiStoreKey = { route: '/characters/{character_id}/skills/', holder: { kind: 'character', id: 91 } };
const CORP_JOBS_KEY: EsiStoreKey = {
  route: '/corporations/{corporation_id}/industry/jobs/',
  holder: { kind: 'user-corporation', id: 98, userId: 'u1' },
};
const CORP_ASSETS_KEY: EsiStoreKey = { route: '/corporations/{corporation_id}/assets/', holder: { kind: 'corporation', id: 98 } };
const STATUS_KEY: EsiStoreKey = { route: '/status/', holder: { kind: 'global' } };

function response(status: number, headers: Record<string, string> = {}, body: unknown = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

/** A parser that hands the JSON body back as ESI sent it. */
const AS_IS = { parse: (body: unknown): unknown => body };

async function allRows() {
  return harness.db.select().from(esiResponses);
}

async function rowOf(key: EsiStoreKey) {
  const target = identityText(rowIdentity(key));
  return (await allRows()).find((row) => identityText(row) === target);
}

describe.skipIf(!harness.reachable)('ESI response store against Postgres', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a committed 200, answers unchanged until it expires, and reports the expiry', async () => {
    fetchSpy.mockResolvedValueOnce(response(200, { ETag: '"v1"', Expires: EXPIRES, 'Last-Modified': new Date(NOW - 1000).toUTCString() }, [1]));
    await expect(isDue([PRICE_KEY])).resolves.toBe(true);
    await expect(storedExpiry([PRICE_KEY])).resolves.toBeNull();

    const first = await fetchStored(PRICE_KEY, AS_IS);
    expect(first.kind).toBe('fresh');
    if (first.kind !== 'fresh') return;
    expect(await rowOf(PRICE_KEY)).toBeUndefined();

    await commit([first.meta], { tag: 'eve:market_prices' });
    const row = await rowOf(PRICE_KEY);
    expect(row).toMatchObject({ holderType: 'global', holderId: 0, userId: '', params: 'region_id=10000002&type_id=34', etags: ['"v1"'], body: null });
    expect(row?.expiresAt?.getTime()).toBe(Date.parse(EXPIRES));
    expect(row?.lastModified?.getTime()).toBe(Date.parse(new Date(NOW - 1000).toUTCString()));

    await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    await expect(isDue([PRICE_KEY])).resolves.toBe(false);
    await expect(storedExpiry([PRICE_KEY])).resolves.toBe(Date.parse(EXPIRES));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('moves the expiry on a 304 and keeps the ETags and body', async () => {
    const later = new Date(NOW + 600_000).toUTCString();
    await commit(
      [{ key: STATUS_KEY, expiresAt: NOW - 1, etags: ['"s1"'], lastModified: NOW - 5000, checkedAt: NOW - 30_000, body: { players: 3 } }],
      { tag: 'eve:eve_status' },
    );
    fetchSpy.mockResolvedValueOnce(response(304, { Expires: later }));

    await expect(fetchStored(STATUS_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: Date.parse(later) });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('If-None-Match')).toBe('"s1"');
    const row = await rowOf(STATUS_KEY);
    expect(row).toMatchObject({ etags: ['"s1"'], body: { players: 3 } });
    expect(row?.expiresAt?.getTime()).toBe(Date.parse(later));
    expect(row?.lastModified?.getTime()).toBe(NOW - 5000);
    expect(row?.checkedAt.getTime()).toBeGreaterThan(NOW - 30_000);
  });

  it('fans one answer out to many keys and lets isDue read across them', async () => {
    await recordExpiryFor([PRICE_KEY, OTHER_PRICE_KEY], { expiresAt: NOW + 60_000, lastModified: null, checkedAt: NOW });
    const rows = await allRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.etags.length === 0 && row.expiresAt?.getTime() === NOW + 60_000)).toBe(true);
    await expect(isDue([PRICE_KEY, OTHER_PRICE_KEY])).resolves.toBe(false);
    await expect(storedExpiry([PRICE_KEY, OTHER_PRICE_KEY, SKILLS_KEY])).resolves.toBeNull();
  });

  it('reads a batch in one row read, calls only the due keys under no lock, and records every 304 in one write', async () => {
    const third: EsiStoreKey = { ...PRICE_KEY, params: { region_id: 10000002, type_id: 36 } };
    await commit(
      [
        { key: PRICE_KEY, expiresAt: NOW + 300_000, etags: ['"a"'], lastModified: null, checkedAt: NOW - 1000 },
        { key: OTHER_PRICE_KEY, expiresAt: NOW - 1, etags: ['"b"'], lastModified: NOW - 5000, checkedAt: NOW - 1000 },
      ],
      { tag: 'eve:market_prices' },
    );
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) =>
      String(url).includes('type_id=35')
        ? response(304, { Expires: EXPIRES })
        : response(200, { ETag: '"c"', Expires: EXPIRES }, [3]),
    );

    // The due key appears twice: both calls are made, and the one write dedupes the row.
    const answers = await fetchStoredMany([PRICE_KEY, OTHER_PRICE_KEY, third, OTHER_PRICE_KEY], { concurrency: 8, ...AS_IS });

    expect(answers.map((answer) => answer.kind)).toEqual(['unchanged', 'unchanged', 'fresh', 'unchanged']);
    expect(answers[0]).toEqual({ kind: 'unchanged', expiresAt: NOW + 300_000 });
    expect(answers[1]).toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit).headers).get('If-None-Match')).toBe('"b"');

    const moved = await rowOf(OTHER_PRICE_KEY);
    expect(moved).toMatchObject({ etags: ['"b"'] });
    expect(moved?.expiresAt?.getTime()).toBe(Date.parse(EXPIRES));
    expect(moved?.lastModified?.getTime()).toBe(NOW - 5000);
    expect((await rowOf(PRICE_KEY))?.expiresAt?.getTime()).toBe(NOW + 300_000);
    expect(await rowOf(third)).toBeUndefined();
    expect(await allRows()).toHaveLength(2);
  });

  it('records many committed metas in one write, the last meta for a repeated key winning', async () => {
    await commit(
      [
        { key: PRICE_KEY, expiresAt: NOW + 1000, etags: ['"old"'], lastModified: null, checkedAt: NOW - 1000 },
        { key: OTHER_PRICE_KEY, expiresAt: NOW + 2000, etags: ['"b"'], lastModified: NOW, checkedAt: NOW },
        { key: PRICE_KEY, expiresAt: NOW + 3000, etags: ['"new"'], lastModified: NOW, checkedAt: NOW },
      ],
      { tag: 'eve:market_prices' },
    );
    const rows = await allRows();
    expect(rows).toHaveLength(2);
    expect(await rowOf(PRICE_KEY)).toMatchObject({ etags: ['"new"'] });
    expect((await rowOf(PRICE_KEY))?.expiresAt?.getTime()).toBe(NOW + 3000);
    await recordExpiryFor([PRICE_KEY, OTHER_PRICE_KEY, PRICE_KEY], { expiresAt: NOW + 9000, lastModified: null, checkedAt: NOW });
    expect((await allRows()).every((row) => row.expiresAt?.getTime() === NOW + 9000 && row.etags.length === 0)).toBe(true);
  });

  it('never lets an answer asked for earlier replace a later one, a committed 200 or a fanned-out stamp alike', async () => {
    await commit([{ key: PRICE_KEY, expiresAt: NOW + 5000, etags: ['"new"'], lastModified: null, checkedAt: NOW }], { tag: 'eve:market_prices' });

    await commit([{ key: PRICE_KEY, expiresAt: NOW + 1000, etags: ['"old"'], lastModified: null, checkedAt: NOW - 1000 }], { tag: 'eve:market_prices' });
    expect(await rowOf(PRICE_KEY)).toMatchObject({ etags: ['"new"'], checkedAt: new Date(NOW) });

    await recordExpiryFor([PRICE_KEY], { expiresAt: NOW + 2000, lastModified: null, checkedAt: NOW - 500 });
    expect((await rowOf(PRICE_KEY))?.expiresAt?.getTime()).toBe(NOW + 5000);
  });

  it('records an owner commit\'s answers in one HTTP batch, all or none, and clears the tags only once they stood', async () => {
    const answers = [
      { key: SKILLS_KEY, expiresAt: NOW + 5000, etags: ['"sk"'], lastModified: null, checkedAt: NOW },
      { key: CORP_JOBS_KEY, expiresAt: NOW + 5000, etags: ['"cj"'], lastModified: NOW - 60_000, checkedAt: NOW },
    ];
    vi.mocked(revalidateTag).mockClear();
    await expect(commitWithWrite(answers)).resolves.toBe('saved');
    expect(await rowOf(SKILLS_KEY)).toMatchObject({ etags: ['"sk"'], checkedAt: new Date(NOW), expiresAt: new Date(NOW + 5000) });
    expect(await rowOf(CORP_JOBS_KEY)).toMatchObject({ etags: ['"cj"'], lastModified: new Date(NOW - 60_000) });
    expect(vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag).sort()).toEqual([datasetTag(CORP_JOBS_KEY), datasetTag(SKILLS_KEY)].sort());

    vi.mocked(revalidateTag).mockClear();
    const older = answers.map((answer) => ({ ...answer, etags: ['"old"'], checkedAt: NOW - 1000 }));
    await expect(commitWithWrite([{ ...older[0]!, checkedAt: NOW + 1000 }, older[1]!])).resolves.toBe('superseded');
    expect((await rowOf(SKILLS_KEY))?.etags).toEqual(['"sk"']);
    expect((await rowOf(CORP_JOBS_KEY))?.etags).toEqual(['"cj"']);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('keys an authed owner read by its holder and records its 304', async () => {
    await commit([{ key: SKILLS_KEY, expiresAt: NOW - 1, etags: ['"sk"'], lastModified: null, checkedAt: NOW - 1000 }], { tag: 'eve:skills:character:91' });
    fetchSpy.mockResolvedValueOnce(response(304, { Expires: EXPIRES }));
    await expect(readStoredAuthed(SKILLS_KEY, 'token')).resolves.toEqual({ kind: 'unchanged', expiresAt: Date.parse(EXPIRES) });
    expect((await rowOf(SKILLS_KEY))?.expiresAt?.getTime()).toBe(Date.parse(EXPIRES));
  });

  it('shares the downtime halt across requests through the status row, and lifts it at 11:30 UTC', async () => {
    const downtime = Date.parse('2026-10-12T11:05:00Z');
    const haltUntil = Date.parse('2026-10-12T11:30:00Z');
    await commit(
      [{ key: PRICE_KEY, expiresAt: downtime - 1, etags: ['"v1"'], lastModified: null, checkedAt: downtime - 60_000 }],
      { tag: 'eve:market_prices' },
    );
    // Another request stored the second 503 of the streak and set the halt.
    await commit(
      [{
        key: STATUS_KEY,
        expiresAt: downtime + 20_000,
        etags: [],
        lastModified: null,
        checkedAt: downtime,
        body: { status: { state: 'offline' }, halt: { failures: [downtime - 30_000, downtime], haltUntil } },
      }],
      { tag: 'eve:eve_status' },
    );

    // Only the clock is faked: the Postgres client needs real timers to answer.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(downtime + 10_000);
      await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: downtime - 1 });
      await expect(readStoredAuthed(SKILLS_KEY, 'token')).rejects.toBeInstanceOf(EsiServerError);
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.setSystemTime(haltUntil);
      fetchSpy.mockResolvedValueOnce(response(304, { Expires: new Date(haltUntil + 300_000).toUTCString() }));
      await expect(fetchStored(PRICE_KEY, AS_IS)).resolves.toEqual({ kind: 'unchanged', expiresAt: haltUntil + 300_000 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('purges character rows with the character and user rows with the user, and leaves corporation rows', async () => {
    const meta = { expiresAt: NOW + 1000, etags: [], lastModified: null, checkedAt: NOW };
    await commit(
      [SKILLS_KEY, CORP_JOBS_KEY, CORP_ASSETS_KEY, PRICE_KEY].map((key) => ({ key, ...meta })),
      { tag: 'eve:test' },
    );
    expect(await allRows()).toHaveLength(4);

    await esiStorePurgeContributor.purgeCharacter?.({ kind: 'character', userId: 'u1', characterId: 91 });
    expect((await allRows()).map((row) => row.holderType).sort()).toEqual(['corporation', 'corporation', 'global']);

    await esiStorePurgeContributor.purgeUser?.({ kind: 'user', userId: 'u1' });
    const left = await allRows();
    expect(left.map((row) => `${row.holderType}:${row.userId}`).sort()).toEqual(['corporation:', 'global:']);
  });

  it('records a member\'s refusal of a corporation answer on their own row: still due for every other user, not for them', async () => {
    const before = Date.now();
    await recordRefusalFor('member', [CORP_ASSETS_KEY], null);

    expect(await rowOf(CORP_ASSETS_KEY)).toBeUndefined();
    const refusal = await rowOf(refusalKeyFor('member', CORP_ASSETS_KEY));
    expect(refusal).toMatchObject({ holderType: 'corporation', holderId: 98, userId: 'member', etags: [], body: null });
    expect(refusal!.expiresAt!.getTime()).toBeGreaterThan(before);
    await expect(isDue([CORP_ASSETS_KEY])).resolves.toBe(true);
    await expect(isDueFor('director', [CORP_ASSETS_KEY])).resolves.toBe(true);
    await expect(isDueFor('member', [CORP_ASSETS_KEY])).resolves.toBe(false);
    // Past the refusal's lifetime the member is due again.
    await expect(isDueFor('member', [CORP_ASSETS_KEY], refusal!.expiresAt!.getTime() + 1)).resolves.toBe(true);

    // A shared answer that still stands takes no refusal, and serves every user.
    await commit([{ key: CORP_ASSETS_KEY, expiresAt: Date.now() + 60_000, etags: ['"a"'], lastModified: null, checkedAt: Date.now() }], { tag: 'eve:test' });
    await recordRefusalFor('other', [CORP_ASSETS_KEY], null);
    expect(await rowOf(refusalKeyFor('other', CORP_ASSETS_KEY))).toBeUndefined();
    await expect(isDueFor('director', [CORP_ASSETS_KEY])).resolves.toBe(false);
  });

  it('keeps a user-held key\'s refusal on its own row, and refuses to record a user\'s refusal on a shared corporation row', async () => {
    await recordRefusalFor('u1', [SKILLS_KEY], null);
    await recordRefusal([CORP_JOBS_KEY], null);

    expect(refusalKeyFor('u1', SKILLS_KEY)).toBe(SKILLS_KEY);
    expect(await rowOf(SKILLS_KEY)).toMatchObject({ holderType: 'character', userId: '', etags: [] });
    expect(await rowOf(CORP_JOBS_KEY)).toMatchObject({ holderType: 'corporation', userId: 'u1', etags: [] });
    await expect(isDueFor('u1', [SKILLS_KEY, CORP_JOBS_KEY])).resolves.toBe(false);
    await expect(recordRefusal([CORP_ASSETS_KEY], null)).rejects.toThrow(/shared by a corporation/);
    expect(await rowOf(CORP_ASSETS_KEY)).toBeUndefined();
  });

  it('purges a user\'s refusals of corporation answers with the user, and leaves the shared rows', async () => {
    await commit([{ key: CORP_ASSETS_KEY, expiresAt: NOW - 1000, etags: ['"a"'], lastModified: null, checkedAt: NOW }], { tag: 'eve:test' });
    await recordRefusalFor('u1', [CORP_ASSETS_KEY], null);
    await recordRefusalFor('u2', [CORP_ASSETS_KEY], null);
    expect(await allRows()).toHaveLength(3);

    await esiStorePurgeContributor.purgeUser?.({ kind: 'user', userId: 'u1' });

    expect((await allRows()).map((row) => row.userId).sort()).toEqual(['', 'u2']);
    await expect(isDueFor('u1', [CORP_ASSETS_KEY])).resolves.toBe(true);
    await expect(isDueFor('u2', [CORP_ASSETS_KEY])).resolves.toBe(false);
  });
});
