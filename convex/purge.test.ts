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

// HOT meta rows + COLD payload rows (SA.5 split) — purge must delete all four.
function skillHot(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    queueEtag: 'q',
    skillsEtag: 's',
    lastSyncedAt: GEN,
    expiresAt: GEN + 60_000,
    syncError: null,
  };
}

function jobHot(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    jobsEtag: 'j',
    lastSyncedAt: GEN,
    expiresAt: GEN + 60_000,
    syncError: null,
  };
}

describe('purge.purgeCharacter', () => {
  it('deletes the target character from both trackers (hot + cold), leaving siblings untouched', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // Three pairs across all four tables: the target, a sibling character, and
      // the same character under a different user.
      for (const [userId, characterId] of [
        [USER, CHAR_A],
        [USER, CHAR_B],
        [OTHER_USER, CHAR_A],
      ] as const) {
        await ctx.db.insert('characterSync', skillHot(userId, characterId));
        await ctx.db.insert('characterSyncData', {
          userId,
          characterId,
          data: { entries: [], totalSp: 1 },
        });
        await ctx.db.insert('industryJobsSync', jobHot(userId, characterId));
        await ctx.db.insert('industryJobsSyncData', { userId, characterId, data: { jobs: [] } });
      }
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
      skillsData: (await ctx.db.query('characterSyncData').collect())
        .map((d) => `${d.userId}:${d.characterId}`)
        .sort(),
      jobs: (await ctx.db.query('industryJobsSync').collect())
        .map((d) => `${d.userId}:${d.characterId}`)
        .sort(),
      jobsData: (await ctx.db.query('industryJobsSyncData').collect())
        .map((d) => `${d.userId}:${d.characterId}`)
        .sort(),
    }));
    // USER:CHAR_A gone from all four tables; the two siblings remain everywhere
    // (sorted: user_purge_1:… precedes user_purge_2:…).
    const survivors = [`${USER}:${CHAR_B}`, `${OTHER_USER}:${CHAR_A}`];
    expect(remaining.skills).toEqual(survivors);
    expect(remaining.skillsData).toEqual(survivors);
    expect(remaining.jobs).toEqual(survivors);
    expect(remaining.jobsData).toEqual(survivors);
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
