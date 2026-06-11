import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// 3.4.3 foundation schema. The only table is the disposable smoke-test
// singleton (see smoke.ts) — real tracker tables land in 3.4.4+.
export default defineSchema({
  smoke: defineTable({
    counter: v.number(),
    lastBumpedBy: v.string(),
  }),
});
