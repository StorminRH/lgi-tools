// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { drainCharacterOnline } from './onlineStatus';
import schema from './schema';

import { modules } from './__tests__/modules.setup';

const USER = 'user_online_1';

describe('onlineStatus.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.onlineStatus.forViewer, {})).toBe(null);
  });

  it('returns the viewer per-character online flags when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'a' });
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 202, online: false, etag: 'b' });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.onlineStatus.forViewer, {});
    expect(view?.characters).toEqual([
      { characterId: 101, online: true },
      { characterId: 202, online: false },
    ]);
  });
});

describe('onlineStatus.purgeForUser', () => {
  // The explicit teardown a Neon account/character purge calls — the lazy orphan-clean
  // can't cover a removed account, so this is its only reaper for that case.
  it('deletes all of a user\'s online docs when characterId is null (account-nuke)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'a' });
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 102, online: false, etag: 'b' });
      await ctx.db.insert('characterOnline', { userId: 'other', characterId: 201, online: true, etag: 'c' });
    });

    const out = await t.mutation(internal.onlineStatus.purgeForUser, { userId: USER, characterId: null });
    expect(out).toEqual({ deleted: 2 });

    const remaining = await t.run((ctx) => ctx.db.query('characterOnline').collect());
    expect(remaining.map((d) => d.userId)).toEqual(['other']); // a different user's doc survives
  });

  it('deletes only the named character when characterId is set (single character-purge)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'a' });
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 102, online: false, etag: 'b' });
    });

    const out = await t.mutation(internal.onlineStatus.purgeForUser, { userId: USER, characterId: 101 });
    expect(out).toEqual({ deleted: 1 });

    const remaining = await t.run((ctx) =>
      ctx.db.query('characterOnline').withIndex('by_user', (q) => q.eq('userId', USER)).collect(),
    );
    expect(remaining.map((d) => d.characterId)).toEqual([102]); // the sibling survives
  });

  it('is a no-op when there is nothing to delete (idempotent — a retried best-effort purge is safe)', async () => {
    const t = convexTest(schema, modules);
    const out = await t.mutation(internal.onlineStatus.purgeForUser, { userId: USER, characterId: null });
    expect(out).toEqual({ deleted: 0 });
  });
});

describe('onlineStatus.drainCharacterOnline', () => {
  it('deletes up to the batch limit — the drain GC delegate', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('characterOnline', {
          userId: `u${i}`, characterId: 100 + i, online: true, etag: null,
        });
      }
    });

    await t.run((ctx) => drainCharacterOnline(ctx, 2));
    expect(await t.run((ctx) => ctx.db.query('characterOnline').collect())).toHaveLength(1);

    await t.run((ctx) => drainCharacterOnline(ctx, 2));
    expect(await t.run((ctx) => ctx.db.query('characterOnline').collect())).toHaveLength(0);
  });
});
