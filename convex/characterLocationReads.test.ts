// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  CHAR_A,
  CHAR_B,
  GEN,
  locationDoc,
  OTHER,
  USER,
} from './__tests__/characterLocation.setup';

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

describe('characterLocationReads.prepareLocationSync', () => {
  async function seedLeftoverRows(t: TestConvex<typeof schema>, count: number) {
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i += 1) {
        const characterId = 80_000_000 + i;
        await ctx.db.insert('characterLocation', locationDoc(USER, characterId));
        await ctx.db.insert('characterLocationOnline', {
          userId: USER,
          characterId,
          online: true,
          etagOnline: 'on',
          onlineExpiresAt: GEN + 60_000,
        });
        await ctx.db.insert('characterLocationAccess', {
          userId: USER,
          characterId,
          accessToken: `tok-${characterId}`,
          expiresAt: GEN + 1_200_000,
          updatedAt: GEN,
        });
      }
    });
  }

  it('skips held and lease collects when nothing is tracked', async () => {
    const leftover = 12;
    const t = convexTest(schema, modules);
    await seedLeftoverRows(t, leftover);
    const prep = await t.query(internal.characterLocationReads.prepareLocationSync, {
      userId: USER,
    });
    expect(prep.trackedIds).toEqual([]);
    expect(prep.locations).toEqual([]);
    expect(prep.online).toEqual([]);
    expect(prep.leases).toEqual([]);
    expect(prep.io.databaseQueries).toBe(1);
    expect(prep.io.documentsRead).toBeLessThan(leftover);
    expect(prep.io.bytesRead).toBeLessThan(leftover * 40);
  });

  it('collect-then-filters a non-empty target without reading more tables than status quo', async () => {
    const leftover = 12;
    const t = convexTest(schema, modules);
    await seedLeftoverRows(t, leftover);
    const empty = await t.query(internal.characterLocationReads.prepareLocationSync, {
      userId: USER,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocationOnline', {
        userId: USER,
        characterId: CHAR_A,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      });
      await ctx.db.insert('characterLocationAccess', {
        userId: USER,
        characterId: CHAR_A,
        accessToken: 'tok-tracked',
        expiresAt: GEN + 600_000,
        updatedAt: GEN,
      });
    });
    const prepared = await t.query(internal.characterLocationReads.prepareLocationSync, {
      userId: USER,
    });
    expect(empty.io.documentsRead).toBeLessThan(prepared.io.documentsRead);
    expect(empty.io.bytesRead).toBeLessThan(prepared.io.bytesRead);
    expect(prepared.io.databaseQueries).toBe(4);
    expect(prepared.io.documentsRead).toBeGreaterThanOrEqual(leftover);
    expect(prepared.trackedIds).toEqual([CHAR_A]);
    expect(prepared.locations).toEqual([
      {
        characterId: CHAR_A,
        solarSystemId: 30_000_142,
        etagLocation: 'loc',
        etagShip: 'ship',
      },
    ]);
    expect(prepared.online).toEqual([
      {
        characterId: CHAR_A,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      },
    ]);
    expect(prepared.leases).toEqual([
      {
        characterId: CHAR_A,
        accessToken: 'tok-tracked',
        expiresAt: GEN + 600_000,
      },
    ]);
  });

  it('many-tracked prep stays at four collects', async () => {
    const t = convexTest(schema, modules);
    const count = 32;
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i += 1) {
        const characterId = 70_000_000 + i;
        await ctx.db.insert('mapTracking', {
          mapId: 'map-a',
          userId: USER,
          characterId,
        });
        await ctx.db.insert('characterLocation', locationDoc(USER, characterId));
        await ctx.db.insert('characterLocationOnline', {
          userId: USER,
          characterId,
          online: true,
          etagOnline: 'on',
          onlineExpiresAt: GEN + 60_000,
        });
        await ctx.db.insert('characterLocationAccess', {
          userId: USER,
          characterId,
          accessToken: `tok-${characterId}`,
          expiresAt: GEN + 1_200_000,
          updatedAt: GEN,
        });
      }
    });
    const prep = await t.query(internal.characterLocationReads.prepareLocationSync, {
      userId: USER,
    });
    expect(prep.trackedIds).toHaveLength(count);
    expect(prep.locations).toHaveLength(count);
    expect(prep.online).toHaveLength(count);
    expect(prep.leases).toHaveLength(count);
    expect(prep.io.databaseQueries).toBe(4);
  });
});
