// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

// Load all .ts modules EXCEPT *.test.ts for the harness (the house pattern).
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_purge_1';
const OTHER_USER = 'user_purge_2';
const CHAR_A = 90000001;
const CHAR_B = 90000002;
const GEN = 1_700_000_000_000;

function skillRow(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    data: { entries: [], totalSp: 1 },
    queueEtag: 'q',
    skillsEtag: 's',
    lastSyncedAt: GEN,
    expiresAt: GEN + 60_000,
    syncError: null,
  };
}

function jobRow(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    data: { jobs: [] },
    jobsEtag: 'j',
    lastSyncedAt: GEN,
    expiresAt: GEN + 60_000,
    syncError: null,
  };
}

describe('purge.purgeCharacter', () => {
  it('deletes the target character from both trackers, leaving siblings untouched', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // Target pair (USER × CHAR_A) in both tables.
      await ctx.db.insert('characterSync', skillRow(USER, CHAR_A));
      await ctx.db.insert('industryJobsSync', jobRow(USER, CHAR_A));
      // Same user, a DIFFERENT character — must survive.
      await ctx.db.insert('characterSync', skillRow(USER, CHAR_B));
      await ctx.db.insert('industryJobsSync', jobRow(USER, CHAR_B));
      // Same character id, a DIFFERENT user — must survive (keyed by user×character).
      await ctx.db.insert('characterSync', skillRow(OTHER_USER, CHAR_A));
      await ctx.db.insert('industryJobsSync', jobRow(OTHER_USER, CHAR_A));
    });

    const counts = await t.mutation(internal.purge.purgeCharacter, {
      userId: USER,
      characterId: CHAR_A,
    });
    expect(counts).toEqual({ skills: 1, jobs: 1 });

    const remaining = await t.run(async (ctx) => ({
      skills: (await ctx.db.query('characterSync').collect())
        .map((d) => `${d.userId}:${d.characterId}`)
        .sort(),
      jobs: (await ctx.db.query('industryJobsSync').collect())
        .map((d) => `${d.userId}:${d.characterId}`)
        .sort(),
    }));
    // USER:CHAR_A gone from both; USER:CHAR_B and OTHER_USER:CHAR_A remain
    // (sorted: user_purge_1:… precedes user_purge_2:…).
    expect(remaining.skills).toEqual([`${USER}:${CHAR_B}`, `${OTHER_USER}:${CHAR_A}`]);
    expect(remaining.jobs).toEqual([`${USER}:${CHAR_B}`, `${OTHER_USER}:${CHAR_A}`]);
  });

  it('is a no-op (zero counts, no throw) when the character has no projections', async () => {
    const t = convexTest(schema, modules);
    const counts = await t.mutation(internal.purge.purgeCharacter, {
      userId: USER,
      characterId: CHAR_A,
    });
    expect(counts).toEqual({ skills: 0, jobs: 0 });
  });
});
