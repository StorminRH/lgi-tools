// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  accessLease,
  CHAR_A,
  CHAR_B,
  GEN,
  locationDoc,
  OTHER,
  USER,
} from './__tests__/characterLocation.setup';

describe('characterLocationReads.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characterLocationReads.forViewer, {})).toBeNull();
  });

  it('never exposes an access-token lease on the public viewer query', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
    });
    const view = await t.withIdentity({ subject: USER }).query(api.characterLocationReads.forViewer, {});
    expect(JSON.stringify(view)).not.toContain('tok-');
    expect(JSON.stringify(view)).not.toContain('accessToken');
  });

  it('returns the viewer location facts when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });
    const view = await t.withIdentity({ subject: USER }).query(api.characterLocationReads.forViewer, {});
    expect(view?.characters).toEqual([
      {
        characterId: CHAR_A,
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
      },
    ]);
  });
});

describe('characterLocationReads.heldState', () => {
  it('returns system id, dual etags, and the held online probe in one snapshot', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocationOnline', {
        userId: USER,
        characterId: CHAR_A,
        online: true,
        etagOnline: 'on',
        onlineExpiresAt: GEN + 60_000,
      });
      await ctx.db.insert('characterLocationOnline', {
        userId: OTHER,
        characterId: CHAR_B,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      });
    });
    const held = await t.query(internal.characterLocationReads.heldState, { userId: USER });
    expect(held).toEqual({
      locations: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_142,
          etagLocation: 'loc',
          etagShip: 'ship',
        },
      ],
      online: [
        {
          characterId: CHAR_A,
          online: true,
          etagOnline: 'on',
          onlineExpiresAt: GEN + 60_000,
        },
      ],
    });
  });
});
