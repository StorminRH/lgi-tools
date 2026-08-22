import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { MAP_PURGE_BATCH, MAP_PURGE_TABLES } from './mapPurge';

import { modules } from './__tests__/modules.setup';

function schemaMapTables(): string[] {
  const source = readFileSync(resolve(process.cwd(), 'convex/schema.ts'), 'utf8');
  return [...source.matchAll(/^  (\w+): defineTable\(\{([\s\S]*?)^  \}\)/gm)]
    .filter((match) => /^    mapId:/m.test(match[2] ?? ''))
    .map((match) => match[1] ?? '')
    .sort();
}

describe('map purge declaration', () => {
  it('equals the complete schema-derived set of map-keyed tables', () => {
    expect([...MAP_PURGE_TABLES].sort()).toEqual(schemaMapTables());
  });

  it('persists one interrupted fair batch and resumes to an empty map', async () => {
    const t = convexTest(schema, modules);
    const mapId = 'map-purge';
    const otherMapId = 'map-survivor';

    await t.run(async (ctx) => {
      for (let index = 0; index < MAP_PURGE_BATCH + 2; index += 1) {
        await ctx.db.insert('mapNotes', {
          mapId,
          targetKind: 'map',
          targetId: `note-${index}`,
          body: 'purge me',
        });
      }
      await ctx.db.insert('mapAccess', { mapId, userId: 'user', roles: ['admin'] });
      await ctx.db.insert('mapAccessProjectionWatermarks', { mapId, revision: 1 });
      await ctx.db.insert('mapSystems', { mapId, systemId: 30_000_142 });
      await ctx.db.insert('mapConnections', {
        mapId,
        fromSystemId: 30_000_142,
        toSystemId: null,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId,
        characterId: 90_000_001,
        lastProcessedTransitionAt: 1,
      });
      await ctx.db.insert('mapEvents', {
        mapId,
        at: 1,
        kind: 'connection_restored',
        actor: 'Mapper',
        payload: { connectionId: 'connection-1' },
        purgeAfter: 2,
      });
      await ctx.db.insert('mapSignatures', {
        mapId,
        systemId: 30_000_142,
        signatureId: 'ABC-123',
        group: 'wormhole',
        typeName: null,
        wormholeTypeCode: null,
        deletedAt: null,
        purgeAfter: null,
      });
      await ctx.db.insert('mapSignatureActivity', {
        mapId,
        systemId: 30_000_142,
        signatureId: 'ABC-123',
        lastSeenAt: 1,
      });
      await ctx.db.insert('mapTracking', {
        mapId,
        userId: 'user',
        characterId: 90_000_001,
      });
      await ctx.db.insert('mapNotes', {
        mapId: otherMapId,
        targetKind: 'map',
        targetId: 'keep',
        body: 'keep me',
      });
    });

    await expect(
      t.mutation(internal.mapPurge.purgeMapBatch, { mapId }),
    ).resolves.toEqual({ deleted: MAP_PURGE_BATCH + 9, hasMore: true });

    const interrupted = await t.run(async (ctx) => ({
      notes: await ctx.db
        .query('mapNotes')
        .withIndex('by_map', (query) => query.eq('mapId', mapId))
        .collect(),
      survivor: await ctx.db
        .query('mapNotes')
        .withIndex('by_map', (query) => query.eq('mapId', otherMapId))
        .collect(),
    }));
    expect(interrupted.notes).toHaveLength(2);
    expect(interrupted.survivor).toHaveLength(1);

    await expect(
      t.mutation(internal.mapPurge.purgeMapBatch, { mapId }),
    ).resolves.toEqual({ deleted: 2, hasMore: false });

    await t.run(async (ctx) => {
      for (const table of MAP_PURGE_TABLES) {
        const rows = await ctx.db
          .query(table)
          .withIndex('by_map', (query) => query.eq('mapId', mapId))
          .collect();
        expect(rows, table).toEqual([]);
      }
    });
  });
});
