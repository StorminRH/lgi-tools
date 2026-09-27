import { describe, expect, it } from 'vitest';
import {
  digestJournalBody,
  planSectionRead,
  planStructures,
  readSectionState,
  referencedStructureIds,
  unresolvedStructureIds,
} from './plan';
import { SHEET_SECTIONS } from './sections';
import type { SectionEnvelope, SheetEsiRead, SheetSectionData, SheetSections, StructureName } from './types';

const NOW = new Date('2026-09-27T12:00:00Z');
const NOW_ISO = NOW.toISOString();
const DAY = 24 * 60 * 60 * 1000;

const fresh = (body: unknown, etag: string | null = '"e"'): SheetEsiRead => ({ kind: 'fresh', body, etag });
const unchanged: SheetEsiRead = { kind: 'unchanged' };
const error = (code: string): SheetEsiRead => ({ kind: 'error', code });

const LOCATION_BODY = { solar_system_id: 30000142, station_id: 60003760 };
const SHIP_BODY = { ship_type_id: 29984, ship_item_id: 1030000000101, ship_name: 'Quiet Ledger' };
const ONLINE_BODY = { online: true, last_login: '2026-09-27T09:00:00Z' };

const previousStatus: SectionEnvelope<'status'> = {
  data: {
    location: { solarSystemId: 30002813, stationId: null, structureId: null },
    ship: { shipTypeId: 12005, shipItemId: 7, shipName: 'Sable Kite' },
    online: { online: false, lastLogin: null, lastLogout: null },
  },
  refreshedAt: '2026-09-27T11:58:00.000Z',
  etags: { location: '"l0"', ship: '"s0"', online: '"o0"' },
};

describe('planSectionRead', () => {
  it('stamps when every part is unchanged', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: unchanged, ship: unchanged, online: unchanged },
      previousStatus,
      NOW,
    );
    expect(plan).toEqual({ kind: 'stamp' });
  });

  it('saves a fresh part and carries the unchanged parts with their held ETags', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: fresh(LOCATION_BODY, '"l1"'), ship: unchanged, online: unchanged },
      previousStatus,
      NOW,
    );
    expect(plan).toEqual({
      kind: 'save',
      envelope: {
        data: {
          location: { solarSystemId: 30000142, stationId: 60003760, structureId: null },
          ship: previousStatus.data!.ship,
          online: previousStatus.data!.online,
        },
        refreshedAt: NOW_ISO,
        etags: { location: '"l1"', ship: '"s0"', online: '"o0"' },
      },
    });
  });

  it('saves every part when there is no previous envelope', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: fresh(LOCATION_BODY, '"l"'), ship: fresh(SHIP_BODY, null), online: fresh(ONLINE_BODY, '"o"') },
      null,
      NOW,
    );
    expect(plan).toMatchObject({
      kind: 'save',
      envelope: {
        data: {
          location: { solarSystemId: 30000142, stationId: 60003760, structureId: null },
          ship: { shipTypeId: 29984, shipItemId: 1030000000101, shipName: 'Quiet Ledger' },
          online: { online: true, lastLogin: '2026-09-27T09:00:00Z', lastLogout: null },
        },
        etags: { location: '"l"', ship: null, online: '"o"' },
      },
    });
    expect(plan).not.toHaveProperty('envelope.denied');
  });

  it('marks the section denied on a 403 and keeps the previous data and ETags', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: error('esi_403'), ship: fresh(SHIP_BODY), online: unchanged },
      previousStatus,
      NOW,
    );
    expect(plan).toEqual({
      kind: 'save',
      envelope: { data: previousStatus.data, refreshedAt: NOW_ISO, etags: previousStatus.etags, denied: true },
    });
  });

  it('marks a never-synced section denied with no data rather than leaving it pending', () => {
    const plan = planSectionRead(SHEET_SECTIONS.wallet, { balance: error('esi_403') }, null, NOW);
    expect(plan).toEqual({
      kind: 'save',
      envelope: { data: null, refreshedAt: NOW_ISO, etags: {}, denied: true },
    });
  });

  it('clears a previous denial when access returns and every part is unchanged', () => {
    const denied = planSectionRead(
      SHEET_SECTIONS.status,
      { location: error('esi_403'), ship: unchanged, online: unchanged },
      previousStatus,
      NOW,
    );
    if (denied.kind !== 'save') throw new Error('Expected a denied envelope');

    const recoveredAt = new Date(NOW.getTime() + 120_000);
    const recovered = planSectionRead(
      SHEET_SECTIONS.status,
      { location: unchanged, ship: unchanged, online: unchanged },
      denied.envelope,
      recoveredAt,
    );
    expect(recovered).toEqual({
      kind: 'save',
      envelope: {
        data: previousStatus.data,
        refreshedAt: recoveredAt.toISOString(),
        etags: previousStatus.etags,
      },
    });
  });

  it('a 403 wins over other errors in the same section', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: error('esi_server_error'), ship: error('esi_403'), online: unchanged },
      previousStatus,
      NOW,
    );
    expect(plan).toMatchObject({ kind: 'save', envelope: { denied: true } });
  });

  it('skips on any other error, naming the code', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: fresh(LOCATION_BODY), ship: error('esi_server_error'), online: unchanged },
      previousStatus,
      NOW,
    );
    expect(plan).toEqual({ kind: 'skip', code: 'esi_server_error' });
  });

  it('skips a contract error instead of storing a half-parsed section', () => {
    const plan = planSectionRead(SHEET_SECTIONS.wallet, { balance: fresh({ balance: 1 }) }, null, NOW);
    expect(plan).toEqual({ kind: 'skip', code: 'contract_error' });
  });

  it('refuses an unchanged part when there is nothing to carry it from', () => {
    const plan = planSectionRead(
      SHEET_SECTIONS.status,
      { location: fresh(LOCATION_BODY), ship: unchanged, online: unchanged },
      null,
      NOW,
    );
    expect(plan).toEqual({ kind: 'skip', code: 'unchanged_without_previous' });
  });
});

describe('digestJournalBody', () => {
  const row = (id: number, daysAgo: number, amount: number, balance?: number, refType = 'bounty_prizes') => ({
    id,
    date: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    ref_type: refType,
    amount,
    ...(balance === undefined ? {} : { balance }),
    description: `row ${id}`,
  });

  it('uses a 30-day window when the page reaches back further and excludes older rows from the flows', () => {
    const digest = digestJournalBody([row(1, 40, 500, 100), row(2, 10, -30.5, 469.5), row(3, 1, 12.25, 481.75)], NOW);
    expect(digest).toEqual({
      windowStart: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      inflow: 12.25,
      outflow: 30.5,
      series: [
        { t: NOW.getTime() - 10 * DAY, balance: 469.5 },
        { t: NOW.getTime() - 1 * DAY, balance: 481.75 },
      ],
      recent: [
        { id: 3, date: row(3, 1, 0).date, refType: 'bounty_prizes', amount: 12.25, balance: 481.75, description: 'row 3' },
        { id: 2, date: row(2, 10, 0).date, refType: 'bounty_prizes', amount: -30.5, balance: 469.5, description: 'row 2' },
        { id: 1, date: row(1, 40, 0).date, refType: 'bounty_prizes', amount: 500, balance: 100, description: 'row 1' },
      ],
    });
  });

  it('starts the window at the oldest row when the page covers less than 30 days', () => {
    const digest = digestJournalBody([row(1, 5, 100, 100), row(2, 2, 50, 150)], NOW);
    expect(digest?.windowStart).toBe(new Date(NOW.getTime() - 5 * DAY).toISOString());
    expect(digest?.inflow).toBe(150);
  });

  it('returns an empty digest with the full window for an empty page', () => {
    expect(digestJournalBody([], NOW)).toEqual({
      windowStart: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      inflow: 0,
      outflow: 0,
      series: [],
      recent: [],
    });
  });

  it('bounds the digest to 48 series points and 20 recent rows', () => {
    const rows = Array.from({ length: 240 }, (_, i) => row(i + 1, 30 - i * 0.125, 1, 1000 + i));
    const digest = digestJournalBody(rows, NOW);
    expect(digest?.series).toHaveLength(48);
    expect(digest?.recent).toHaveLength(20);
    expect(digest?.recent[0]?.id).toBe(240);
    expect(digest?.series.at(-1)?.balance).toBe(1239);
    expect(digest?.series.every((point, i, all) => i === 0 || point.t > all[i - 1]!.t)).toBe(true);
  });

  it('counts a row without a balance in the flows but not in the series', () => {
    const digest = digestJournalBody([row(1, 3, -20), row(2, 1, 5, 85)], NOW);
    expect(digest?.outflow).toBe(20);
    expect(digest?.series).toEqual([{ t: NOW.getTime() - 1 * DAY, balance: 85 }]);
    expect(digest?.recent[1]?.balance).toBeNull();
  });

  it('rounds the flows to ISK cents', () => {
    const digest = digestJournalBody([row(1, 1, 0.1, 1), row(2, 1, 0.2, 1)], NOW);
    expect(digest?.inflow).toBe(0.3);
  });

  it('returns null on a body that is not a journal page', () => {
    expect(digestJournalBody({ error: 'forbidden' }, NOW)).toBeNull();
  });
});

const sheetWithStructures = (names: Record<string, StructureName> | null): SheetSections => ({
  status: {
    data: {
      location: { solarSystemId: 30001363, stationId: null, structureId: 1099000000001 },
      ship: { shipTypeId: 29984, shipItemId: 1, shipName: 'x' },
      online: { online: false, lastLogin: null, lastLogout: null },
    },
    refreshedAt: NOW_ISO,
    etags: {},
  },
  clones: {
    data: {
      clones: {
        home: { locationId: 1099000000002, locationType: 'structure' },
        jumpClones: [
          {
            jumpCloneId: 1,
            location: { locationId: 60003760, locationType: 'station' },
            implantTypeIds: [],
            name: null,
          },
          {
            jumpCloneId: 2,
            location: { locationId: 1099000000001, locationType: 'structure' },
            implantTypeIds: [],
            name: null,
          },
        ],
        lastCloneJumpDate: null,
      },
    },
    refreshedAt: NOW_ISO,
    etags: {},
  },
  ...(names === null ? {} : { structures: { data: { names }, refreshedAt: NOW_ISO, etags: {} } }),
});

describe('referencedStructureIds / unresolvedStructureIds', () => {
  it('collects structure ids from the dock, the home clone and jump clones, sorted and unique', () => {
    expect(referencedStructureIds(sheetWithStructures(null))).toEqual([1099000000001, 1099000000002]);
  });

  it('ignores stations and an empty sheet', () => {
    expect(referencedStructureIds(null)).toEqual([]);
    expect(referencedStructureIds({})).toEqual([]);
  });

  it('reports only the ids without a stored name entry, including denied ones as resolved', () => {
    const sheet = sheetWithStructures({ '1099000000001': { kind: 'hidden' } });
    expect(unresolvedStructureIds(sheet)).toEqual([1099000000002]);
  });
});

describe('planStructures', () => {
  const ids = [1099000000001, 1099000000002];

  it('stores fresh names and records hidden structures as null so they are not re-requested', () => {
    const reads = new Map<number, SheetEsiRead>([
      [1099000000001, fresh({ name: 'Sobaseki - Driftwood Anchorage', owner_id: 1 })],
      [1099000000002, error('esi_403')],
    ]);
    expect(planStructures(ids, null, reads, NOW)).toEqual({
      kind: 'save',
      envelope: {
        data: {
          names: { '1099000000001': { kind: 'named', name: 'Sobaseki - Driftwood Anchorage' }, '1099000000002': { kind: 'hidden' } },
        },
        refreshedAt: NOW_ISO,
        etags: {},
      },
    });
  });

  it('treats a 404 like a 403', () => {
    const plan = planStructures([1099000000001], null, new Map([[1099000000001, error('esi_404')]]), NOW);
    expect(plan).toMatchObject({ kind: 'save', envelope: { data: { names: { '1099000000001': { kind: 'hidden' } } } } });
  });

  it('carries previously resolved names and prunes ids no longer referenced', () => {
    const previous: SheetSectionData['structures'] = { names: { '1099000000001': { kind: 'named', name: 'Kept' }, '1099000000009': { kind: 'named', name: 'Gone' } } };
    const plan = planStructures([1099000000001], previous, new Map(), NOW);
    expect(plan).toMatchObject({ kind: 'save', envelope: { data: { names: { '1099000000001': { kind: 'named', name: 'Kept' } } } } });
  });

  it('stamps when nothing was read and nothing was pruned', () => {
    const previous: SheetSectionData['structures'] = { names: { '1099000000001': { kind: 'named', name: 'Kept' } } };
    expect(planStructures([1099000000001], previous, new Map(), NOW)).toEqual({ kind: 'stamp' });
  });

  it('saves an empty map the first time so the section gains a freshness stamp', () => {
    expect(planStructures([], null, new Map(), NOW)).toEqual({
      kind: 'save',
      envelope: { data: { names: {} }, refreshedAt: NOW_ISO, etags: {} },
    });
  });

  it('skips on a retryable error when nothing else changed, but saves the rest otherwise', () => {
    const previous: SheetSectionData['structures'] = { names: { '1099000000001': { kind: 'named', name: 'Kept' } } };
    const failing = new Map<number, SheetEsiRead>([[1099000000002, error('esi_server_error')]]);
    expect(planStructures(ids, previous, failing, NOW)).toEqual({ kind: 'skip', code: 'esi_server_error' });

    const mixed = new Map<number, SheetEsiRead>([
      [1099000000001, fresh({ name: 'Renamed' })],
      [1099000000002, error('esi_server_error')],
    ]);
    expect(planStructures(ids, previous, mixed, NOW)).toMatchObject({
      kind: 'save',
      envelope: { data: { names: { '1099000000001': { kind: 'named', name: 'Renamed' } } } },
    });
  });

  it('skips a contract error', () => {
    const plan = planStructures([1099000000001], null, new Map([[1099000000001, fresh({ owner_id: 1 })]]), NOW);
    expect(plan).toEqual({ kind: 'skip', code: 'contract_error' });
  });
});

describe('readSectionState', () => {
  it('is stale with nothing held for an unknown character', () => {
    expect(readSectionState(null, 'wallet')).toEqual({ lastRefreshedAt: null, previous: null, heldEtags: {} });
  });

  it('holds the ETags of a section that has data', () => {
    const sheet: SheetSections = { status: previousStatus };
    expect(readSectionState(sheet, 'status')).toEqual({
      lastRefreshedAt: new Date(previousStatus.refreshedAt),
      previous: previousStatus,
      heldEtags: previousStatus.etags,
    });
  });

  it('holds no ETags for a denied section without data, so a re-grant fetches in full', () => {
    const denied: SectionEnvelope<'wallet'> = { data: null, refreshedAt: NOW_ISO, etags: { balance: '"x"' }, denied: true };
    expect(readSectionState({ wallet: denied }, 'wallet')).toEqual({
      lastRefreshedAt: NOW,
      previous: denied,
      heldEtags: {},
    });
  });

  it('forces structures stale while a referenced id has no name entry', () => {
    const unresolved = sheetWithStructures({ '1099000000001': { kind: 'named', name: 'Known' } });
    expect(readSectionState(unresolved, 'structures').lastRefreshedAt).toBeNull();

    const resolved = sheetWithStructures({ '1099000000001': { kind: 'named', name: 'Known' }, '1099000000002': { kind: 'hidden' } });
    expect(readSectionState(resolved, 'structures').lastRefreshedAt).toEqual(NOW);
  });
});
