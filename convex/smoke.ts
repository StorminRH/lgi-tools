// DISPOSABLE smoke test (3.4.3) — delete this module (and the `smoke` table in
// schema.ts) in the session that lands real tracker tables. It exists to prove
// the foundation end-to-end: a reactive query streaming over the websocket, a
// mutation round-trip, and ctx.auth.getUserIdentity() resolving the spine's
// JWT (subject = the Better Auth user id) or null for anonymous visitors.
import { mutation, query } from './_generated/server';

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const doc = await ctx.db.query('smoke').first();
    return {
      counter: doc?.counter ?? 0,
      lastBumpedBy: doc?.lastBumpedBy ?? null,
      viewerSubject: identity?.subject ?? null,
    };
  },
});

// Deliberately callable logged-out (records 'anonymous') — the smoke page is
// the only caller and is itself admin-gated on production.
export const bump = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const who = identity?.subject ?? 'anonymous';
    const doc = await ctx.db.query('smoke').first();
    if (doc) {
      await ctx.db.patch(doc._id, { counter: doc.counter + 1, lastBumpedBy: who });
    } else {
      await ctx.db.insert('smoke', { counter: 1, lastBumpedBy: who });
    }
  },
});
