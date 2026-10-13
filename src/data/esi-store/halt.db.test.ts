import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { __resetEsiGateForTests } from '@/platform/esi';
import { esiJsonPostInit } from '@/platform/esi/request-init';
import { esiPassThrough } from './index';

/**
 * The downtime halt reads the shared /status/ row from esi_responses, but
 * only inside 10:55-11:30 UTC. A DB suite whose code reaches the ESI store
 * must therefore clone esi_responses and steer the request DB, or it passes
 * all day and fails in that window. This suite deliberately leaves the
 * table out and pins the clock on both sides of the window, so the
 * dependency shows on every run instead of only during downtime.
 */
const harness = await createDbTestHarness({
  schema: 'test_esi_store_halt_without_table',
  tables: [],
  steerDbProxy: true,
});

const IN_WINDOW = Date.parse('2026-10-12T11:00:00Z');
const OUTSIDE_WINDOW = Date.parse('2026-10-12T15:00:00Z');

describe.skipIf(!harness.reachable)('the downtime halt against a harness without esi_responses', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]));
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetEsiGateForTests();
  });

  it('fails on the missing esi_responses table inside the window, before any call reaches ESI', async () => {
    vi.setSystemTime(IN_WINDOW);

    await expect(esiPassThrough('/universe/names/', undefined, esiJsonPostInit([60_000_001]))).rejects.toThrow(
      /from "esi_responses"/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads no status row outside the window, so the same call goes straight to ESI', async () => {
    vi.setSystemTime(OUTSIDE_WINDOW);

    const res = await esiPassThrough('/universe/names/', undefined, esiJsonPostInit([60_000_001]));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
