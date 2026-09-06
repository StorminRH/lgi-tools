// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import { modules } from './__tests__/modules.setup';
import { MAP_SIGNATURE_PAGE_SIZE } from './mapScan';
import schema from './schema';

const MAP = 'map-a';
const SYSTEM = 31_000_001;
const VIEWER = 'viewer';
const EDITOR = 'editor';
type ScanDb = TestConvex<typeof schema>;

async function seed(t: ScanDb) {
  await t.run(async (ctx) => {
    for (const mapId of [MAP, 'map-b']) {
      await ctx.db.insert('mapAccess', { mapId, userId: VIEWER, roles: ['viewer'] });
    }
    await ctx.db.insert('mapAccess', { mapId: MAP, userId: EDITOR, roles: ['editor'] });
    await ctx.db.insert('mapSystems', {
      mapId: MAP, systemId: SYSTEM, deletedAt: null, purgeAfter: null,
    });
    for (const [mapId, systemId, count] of [
      [MAP, SYSTEM, 225], [MAP, SYSTEM + 1, 130], ['map-b', SYSTEM, 130],
    ] satisfies [string, number, number][]) {
      for (let index = 0; index < count; index += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId, systemId, signatureId: `SIG-${String(index).padStart(3, '0')}`,
          kind: 'signature', group: null, typeName: null, wormholeTypeCode: null,
          deletedAt: null, purgeAfter: null,
        });
      }
    }
  });
}

function page(t: ScanDb, cursor: string | null = null) {
  return t.withIdentity({ subject: VIEWER }).query(api.mapScan.watchSystemSignatures, {
    mapId: MAP, systemId: SYSTEM, paginationOpts: { cursor, numItems: 1000 },
  });
}

describe('system signature subscriptions', () => {
  it('bounds every page and isolates both map and system across the complete cursor chain', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await page(t);
    const second = await page(t, first.continueCursor);
    const third = await page(t, second.continueCursor);

    expect(first.page).toHaveLength(MAP_SIGNATURE_PAGE_SIZE);
    expect(second.page).toHaveLength(MAP_SIGNATURE_PAGE_SIZE);
    expect(third.page).toHaveLength(25);
    expect([first.isDone, second.isDone, third.isDone]).toEqual([false, false, true]);
    const rows = [...first.page, ...second.page, ...third.page];
    expect(new Set(rows.map((row) => row._id)).size).toBe(225);
    expect(rows.every((row) => row.mapId === MAP && row.systemId === SYSTEM)).toBe(true);

    for (const [mapId, systemId] of [[MAP, SYSTEM + 1], ['map-b', SYSTEM]] satisfies [string, number][]) {
      const other = await t.withIdentity({ subject: VIEWER }).query(api.mapScan.watchSystemSignatures, {
        mapId, systemId, paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(other.page).toHaveLength(10);
      expect(other.page.every((row) => row.mapId === mapId && row.systemId === systemId)).toBe(true);
    }
  });

  it('continues beyond a page of tombstones and observes remove and restore', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await page(t);
    const signatureIds = first.page.map((row) => row.signatureId);
    const editor = t.withIdentity({ subject: EDITOR });
    await editor.mutation(api.mapScan.removeSignatures, {
      mapId: MAP, systemId: SYSTEM, signatureIds,
    });
    const removed = await page(t);
    expect(removed.page).toEqual([]);
    expect(removed.isDone).toBe(false);
    const next = await page(t, removed.continueCursor);
    expect(next.page).toHaveLength(MAP_SIGNATURE_PAGE_SIZE);
    expect(next.page.some((row) => signatureIds.includes(row.signatureId))).toBe(false);

    await editor.mutation(api.mapScan.restoreSignatures, {
      mapId: MAP, systemId: SYSTEM, signatureIds,
    });
    expect((await page(t)).page.map((row) => row.signatureId)).toEqual(signatureIds);
  });

  it('returns terminal empty pages for anonymous, unauthorized, and revoked viewers', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const args = { mapId: MAP, systemId: SYSTEM, paginationOpts: { cursor: null, numItems: 10 } };
    const denied = { page: [], isDone: true, continueCursor: '' };
    expect(await t.query(api.mapScan.watchSystemSignatures, args)).toEqual(denied);
    expect(await t.withIdentity({ subject: 'stranger' }).query(api.mapScan.watchSystemSignatures, args)).toEqual(denied);
    const first = await page(t);
    await t.run(async (ctx) => {
      const claim = await ctx.db.query('mapAccess')
        .withIndex('by_map_user', (q) => q.eq('mapId', MAP).eq('userId', VIEWER)).unique();
      if (claim === null) throw new Error('Viewer claim missing');
      await ctx.db.delete(claim._id);
    });
    expect(await page(t)).toEqual(denied);
    expect(await page(t, first.continueCursor)).toEqual(denied);
  });

  it('places both selection bounds in the indexed read before pagination', () => {
    const source = readFileSync('convex/mapScan.ts', 'utf8');
    const watcher = source.slice(source.indexOf('export const watchSystemSignatures'));
    expect(watcher).toMatch(/withIndex\('by_map_signature',[\s\S]*?q\.eq\('mapId', mapId\)\.eq\('systemId', systemId\)[\s\S]*?\.paginate\(boundedPageOptions\(paginationOpts\)\)/);
  });
});
