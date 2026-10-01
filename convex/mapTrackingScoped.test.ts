// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { eventActor } from './mapAuthoringEvents';
import schema from './schema';

import { modules } from './__tests__/modules.setup';

const MAP = 'map-scoped';
const OWNER = 'user-owner';
const MEMBER = 'user-member';
const MAIN = 90_000_001;
const ALT = 90_000_002;
const OUTSIDER = 90_000_003;

type Chain = TestConvex<typeof schema>;
type Claim = {
  userId: string;
  roles: Array<'viewer' | 'editor' | 'admin'>;
  characters?: Array<{ characterId: number; name: string }>;
};
let nextRevision = 1;

function asUser(t: Chain, userId: string, name?: string) {
  return t.withIdentity(name === undefined ? { subject: userId } : { subject: userId, name });
}

function reconcile(t: Chain, claims: Claim[]) {
  const revision = nextRevision;
  nextRevision += 1;
  return t.mutation(internal.mapAccessProjection.reconcileMapClaims, { mapId: MAP, revision, claims });
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
    await reconcile(t, [scopedMember]);

    await expect(track(t, MEMBER, ALT)).resolves.toEqual({ tracked: true });
    await expect(track(t, MEMBER, OUTSIDER)).rejects.toThrow('CHARACTER_NOT_ELIGIBLE');
    expect(await trackedIds(t, MEMBER)).toEqual([ALT]);
  });

  it('keeps legacy claims trackable for any character', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [{ userId: MEMBER, roles: ['viewer'] }]);

    await expect(track(t, MEMBER, OUTSIDER)).resolves.toEqual({ tracked: true });
    const access = await asUser(t, MEMBER).query(api.mapChainAccess.watchMapAccess, { mapId: MAP });
    expect(access).toEqual({ granted: true, canEdit: false, trackableCharacterIds: null });
  });

  it('reports the eligible ids to the tracking menu', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [scopedMember]);
    const access = await asUser(t, MEMBER).query(api.mapChainAccess.watchMapAccess, { mapId: MAP });
    expect(access).toEqual({ granted: true, canEdit: false, trackableCharacterIds: [MAIN, ALT] });
  });

  it('drops tracking for a character that left the eligible set while the account keeps its claim', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [scopedMember]);
    await track(t, MEMBER, MAIN);
    await track(t, MEMBER, ALT);

    const counts = await reconcile(t, [{
      ...scopedMember,
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(counts).toMatchObject({ updated: 1, deleted: 0, outcome: 'applied' });
    expect(await trackedIds(t, MEMBER)).toEqual([MAIN]);

    const unchanged = await reconcile(t, [{
      ...scopedMember,
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(unchanged).toMatchObject({ updated: 0, unchanged: 1 });
    expect(await trackedIds(t, MEMBER)).toEqual([MAIN]);
  });

  it('refuses to put a scoped map back on account-level claims', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [scopedMember]);
    await track(t, MEMBER, ALT);
    await expect(reconcile(t, [{ userId: MEMBER, roles: ['viewer'] }]))
      .resolves.toMatchObject({ outcome: 'unscoped-refused' });
    expect(await trackedIds(t, MEMBER)).toEqual([ALT]);
    await expect(track(t, MEMBER, OUTSIDER)).rejects.toThrow(/CHARACTER_NOT_ELIGIBLE/);
  });
});

describe('eventActor', () => {
  async function actorFor(t: Chain, userId: string, name?: string) {
    return asUser(t, userId, name).run((ctx) => eventActor(ctx, MAP));
  }

  it('signs legacy claims with the account name', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [{ userId: OWNER, roles: ['admin'] }]);
    expect(await actorFor(t, OWNER, 'Account Name')).toBe('Account Name');
    expect(await actorFor(t, OWNER)).toBe('unknown');
  });

  it('signs scoped claims with the earliest tracked eligible character, else the first eligible', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [{ ...scopedMember, roles: ['editor'] }]);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Main Pilot');

    await track(t, MEMBER, ALT);
    await track(t, MEMBER, MAIN);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Alt Pilot');

    await reconcile(t, [{
      ...scopedMember,
      roles: ['editor'],
      characters: [{ characterId: MAIN, name: 'Main Pilot' }],
    }]);
    expect(await actorFor(t, MEMBER, 'Account Name')).toBe('Main Pilot');
  });

  it('falls back to the account name for a creator with no eligible characters', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, [{ userId: OWNER, roles: ['admin'], characters: [] }]);
    expect(await actorFor(t, OWNER, 'Creator')).toBe('Creator');
  });
});
