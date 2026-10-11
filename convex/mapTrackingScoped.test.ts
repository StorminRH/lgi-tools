// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { gatedAuthoringEdit } from './lib/mapAuthoringEvents';
import schema from './schema';

import { claimReconciler, expectConvexErrorCode, type Chain } from './__tests__/convexTest.setup';
import { modules } from './__tests__/modules.setup';

const MAP = 'map-scoped';
const OWNER = 'user-owner';
const MEMBER = 'user-member';
const MAIN = 90_000_001;
const ALT = 90_000_002;
const OUTSIDER = 90_000_003;

type Claim = {
  userId: string;
  roles: Array<'viewer' | 'editor' | 'admin'>;
  characters?: Array<{ characterId: number; name: string }>;
};

function asUser(t: Chain, userId: string, name?: string) {
  return t.withIdentity(name === undefined ? { subject: userId } : { subject: userId, name });
}

function track(t: Chain, userId: string, characterId: number) {
  return asUser(t, userId).mutation(api.mapTrackingOptIn.setTracking, {
    mapId: MAP, characterId, tracked: true,
  });
}

async function trackedIds(t: Chain, userId: string) {
  const result = await asUser(t, userId).query(api.mapTrackingLive.forMap, { mapId: MAP });
  return result.ownTrackedCharacterIds;
}

const scopedMember: Claim = {
  userId: MEMBER,
  roles: ['viewer'],
  characters: [{ characterId: MAIN, name: 'Main Pilot' }, { characterId: ALT, name: 'Alt Pilot' }],
};

describe('character-scoped tracking', () => {
  it('lets only the claim\'s eligible characters be tracked and rejects the rest by code', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [scopedMember]);

    await expect(track(t, MEMBER, ALT)).resolves.toEqual({ tracked: true });
    await expectConvexErrorCode(track(t, MEMBER, OUTSIDER), 'CHARACTER_NOT_ELIGIBLE');
    expect(await trackedIds(t, MEMBER)).toEqual([ALT]);
  });

  it('keeps legacy claims trackable for any character', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]);

    await expect(track(t, MEMBER, OUTSIDER)).resolves.toEqual({ tracked: true });
    const access = await asUser(t, MEMBER).query(api.mapChainAccess.watchMapAccess, { mapId: MAP });
    expect(access).toEqual({ granted: true, canEdit: false, trackableCharacterIds: null });
  });

  it('reports the eligible ids to the tracking menu', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [scopedMember]);
    const access = await asUser(t, MEMBER).query(api.mapChainAccess.watchMapAccess, { mapId: MAP });
    expect(access).toEqual({ granted: true, canEdit: false, trackableCharacterIds: [MAIN, ALT] });
  });

  it('drops tracking for a character that left the eligible set while the account keeps its claim', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [scopedMember]);
    await track(t, MEMBER, MAIN);
    await track(t, MEMBER, ALT);

    const counts = await reconcile(MAP, [{
      ...scopedMember,
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(counts).toMatchObject({ updated: 1, deleted: 0, outcome: 'applied' });
    expect(await trackedIds(t, MEMBER)).toEqual([MAIN]);

    const unchanged = await reconcile(MAP, [{
      ...scopedMember,
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(unchanged).toMatchObject({ updated: 0, unchanged: 1 });
    expect(await trackedIds(t, MEMBER)).toEqual([MAIN]);
  });

  it('prunes only ineligible tracking across hundreds of scoped claimants on one map read', async () => {
    // One tracking read per claimant would overrun this budget on the first apply.
    const t = convexTest({ schema, modules, transactionLimits: { databaseQueries: 32 } });
    const reconcile = claimReconciler(t);
    const claimants: Claim[] = Array.from({ length: 300 }, (_, index) => ({
      userId: `user-${index}`,
      roles: ['viewer'],
      characters: [
        { characterId: 91_000_000 + index * 2, name: `Main ${index}` },
        { characterId: 91_000_001 + index * 2, name: `Alt ${index}` },
      ],
    }));
    await expect(reconcile(MAP, claimants))
      .resolves.toMatchObject({ inserted: 300, outcome: 'applied' });
    for (const { userId, characters = [] } of claimants.slice(0, 3)) {
      for (const { characterId } of characters) await track(t, userId, characterId);
    }

    const narrowed = claimants.map((claimant) => claimant.userId === 'user-1'
      ? { ...claimant, characters: claimant.characters?.slice(0, 1) }
      : claimant);
    await expect(reconcile(MAP, narrowed)).resolves.toEqual({
      inserted: 0, updated: 1, deleted: 0, unchanged: 299, outcome: 'applied', characterScoped: true,
    });

    const remaining = await t.run(async (ctx) =>
      (await ctx.db.query('mapTracking').withIndex('by_map', (q) => q.eq('mapId', MAP)).collect())
        .map((row) => `${row.userId}:${row.characterId}`).sort());
    expect(remaining).toEqual([
      'user-0:91000000', 'user-0:91000001', 'user-1:91000002', 'user-2:91000004', 'user-2:91000005',
    ]);
  });

  it('refuses to put a scoped map back on account-level claims', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [scopedMember]);
    await track(t, MEMBER, ALT);
    await expect(reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]))
      .resolves.toMatchObject({ outcome: 'unscoped-refused' });
    expect(await trackedIds(t, MEMBER)).toEqual([ALT]);
    await expectConvexErrorCode(track(t, MEMBER, OUTSIDER), 'CHARACTER_NOT_ELIGIBLE');
  });
});

describe('gatedAuthoringEdit actor', () => {
  async function actorFor(t: Chain, userId: string, name?: string) {
    return asUser(t, userId, name).run((ctx) =>
      gatedAuthoringEdit(ctx, MAP, async (actor, principal) => {
        expect(principal.userId).toBe(userId);
        return actor;
      }));
  }

  it('signs legacy claims with the account name', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: OWNER, roles: ['admin'] }]);
    expect(await actorFor(t, OWNER, 'Account Name')).toBe('Account Name');
    expect(await actorFor(t, OWNER)).toBe('unknown');
  });

  it('refuses a caller without edit before running the edit', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [scopedMember]);
    const run = vi.fn(async () => 'ran');

    await expectConvexErrorCode(
      asUser(t, MEMBER, 'Account Name').run((ctx) => gatedAuthoringEdit(ctx, MAP, run)),
      'FORBIDDEN',
    );
    await expectConvexErrorCode(
      t.run((ctx) => gatedAuthoringEdit(ctx, MAP, run)),
      'UNAUTHENTICATED',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('signs scoped claims with the earliest tracked eligible character, else the first eligible', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ ...scopedMember, roles: ['editor'] }]);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Main Pilot');

    await track(t, MEMBER, ALT);
    await track(t, MEMBER, MAIN);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Alt Pilot');

    await reconcile(MAP, [{
      ...scopedMember,
      roles: ['editor'],
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Main Pilot');
  });

  it('falls back to the account name for a creator with no eligible characters', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: OWNER, roles: ['admin'], characters: [] }]);
    expect(await actorFor(t, OWNER, 'Creator')).toBe('Creator');
  });
});

describe('legacy character-scoping barrier', () => {
  const freeze = (t: Chain) => t.mutation(internal.mapAccessProjection.freezeMapTrackingForScoping, { mapId: MAP });
  const pending = (t: Chain) => t.run(async (ctx) =>
    (await ctx.db.query('mapAccessProjectionWatermarks')
      .withIndex('by_map', (q) => q.eq('mapId', MAP)).unique())?.scopingPending === true);

  it('freezes late opt-ins while preserving existing tracking and opt-out until scoped delivery', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]);
    await track(t, MEMBER, MAIN);
    await expect(freeze(t)).resolves.toEqual([{ userId: MEMBER, characterId: MAIN }]);
    await expectConvexErrorCode(track(t, MEMBER, ALT), 'TRACKING_SCOPING_PENDING');
    await expect(track(t, MEMBER, MAIN)).resolves.toEqual({ tracked: true });
    await asUser(t, MEMBER).mutation(api.mapTrackingOptIn.setTracking, {
      mapId: MAP, characterId: MAIN, tracked: false,
    });
    await reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]);
    expect(await pending(t)).toBe(true);
    await expectConvexErrorCode(track(t, MEMBER, MAIN), 'TRACKING_SCOPING_PENDING');
    await reconcile(MAP, [scopedMember]);
    expect(await pending(t)).toBe(false);
    expect(await trackedIds(t, MEMBER)).toEqual([]);
    await expect(track(t, MEMBER, ALT)).resolves.toEqual({ tracked: true });
  });

  it('retains the pause after failed or stale delivery and releases it on a successful queued retry', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]);
    await freeze(t);
    await expect(t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
      mapId: MAP, revision: 2,
      claims: [{ userId: MEMBER, roles: ['owner'], characters: [] }],
    } as never)).rejects.toThrow();
    expect(await pending(t)).toBe(true);
    await expect(t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
      mapId: MAP, revision: 0, claims: [scopedMember],
    })).resolves.toMatchObject({ outcome: 'stale' });
    expect(await pending(t)).toBe(true);
    await reconcile(MAP, [scopedMember]);
    expect(await pending(t)).toBe(false);
  });

  it('keeps concurrent workers frozen and does not pause a map already scoped by another worker', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: MEMBER, roles: ['viewer'] }]);
    await track(t, MEMBER, MAIN);
    const snapshots = await Promise.all([freeze(t), freeze(t)]);
    expect(snapshots).toEqual([
      [{ userId: MEMBER, characterId: MAIN }], [{ userId: MEMBER, characterId: MAIN }],
    ]);
    await expectConvexErrorCode(track(t, MEMBER, ALT), 'TRACKING_SCOPING_PENDING');
    await reconcile(MAP, [scopedMember]);
    await freeze(t);
    expect(await pending(t)).toBe(false);
    await expect(track(t, MEMBER, ALT)).resolves.toEqual({ tracked: true });
  });
});
