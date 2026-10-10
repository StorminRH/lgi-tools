// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { eventActor } from './mapAuthoringEvents';
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

describe('eventActor', () => {
  async function actorFor(t: Chain, userId: string, name?: string) {
    return asUser(t, userId, name).run((ctx) => eventActor(ctx, MAP));
  }

  it('signs legacy claims with the account name', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP, [{ userId: OWNER, roles: ['admin'] }]);
    expect(await actorFor(t, OWNER, 'Account Name')).toBe('Account Name');
    expect(await actorFor(t, OWNER)).toBe('unknown');
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
