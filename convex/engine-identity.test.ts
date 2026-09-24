// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import { modules } from './__tests__/modules.setup';
import schema from './schema';

describe('heartbeat account scope', () => {
  it('returns only the authenticated subject, or null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.engine.currentUser, {})).toBeNull();
    expect(await t.withIdentity({ subject: 'account-a' }).query(api.engine.currentUser, {}))
      .toBe('account-a');
    expect(await t.withIdentity({ subject: 'account-b' }).query(api.engine.currentUser, {}))
      .toBe('account-b');
  });

  it('ignores an old coordinator after the authenticated account changes', async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity({ subject: 'account-b' });
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'mount',
      visible: true,
      tabId: 'old-account-tab',
      expectedUserId: 'account-a',
    });
    const rows = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      subjects: await ctx.db.query('syncSubjects').collect(),
    }));
    expect(rows).toEqual({ presence: [], subjects: [] });
  });

  it('accepts the matching account', async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: 'account-a' }).mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [],
      reason: 'mount',
      visible: true,
      tabId: 'coordinated-tab',
      expectedUserId: 'account-a',
    });
    const presence = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(presence).toMatchObject({ userId: 'account-a', tabId: 'coordinated-tab' });
  });
});
