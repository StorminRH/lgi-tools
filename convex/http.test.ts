// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const SECRET = 'test-service-secret';
const USER = 'user_http_1';
const CHAR = 90000001;
const GEN = 1_700_000_000_000;

function authHeaders() {
  return { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
}

beforeEach(() => {
  vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /purge-character', () => {
  it('purges the character and returns counts with a valid bearer + body', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: CHAR,
        queueEtag: null,
        skillsEtag: null,
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
    });

    const res = await t.fetch('/purge-character', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId: USER, characterId: CHAR }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skills: 1, jobs: 0 });
    const remaining = await t.run(
      async (ctx) => (await ctx.db.query('characterSync').collect()).length,
    );
    expect(remaining).toBe(0);
  });

  it('rejects a missing/incorrect bearer with 401', async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch('/purge-character', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: JSON.stringify({ userId: USER, characterId: CHAR }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid body with 400', async () => {
    const t = convexTest(schema, modules);
    const badBodies: unknown[] = [
      {},
      { userId: '', characterId: CHAR },
      { userId: USER, characterId: 0 },
      { userId: USER, characterId: 1.5 },
      { userId: USER, characterId: 'not-a-number' },
      'not-an-object',
    ];
    for (const body of badBodies) {
      const res = await t.fetch('/purge-character', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });
});
