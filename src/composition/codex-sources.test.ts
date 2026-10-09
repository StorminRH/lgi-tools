import { beforeEach, describe, expect, it, vi } from 'vitest';

const readers = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  getWormholeCodex: vi.fn(),
  getSystemDirectory: vi.fn(),
  getSystemStatics: vi.fn(),
  getPricedSiteDetail: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  getTypeLabels: vi.fn(),
  getTypesByIds: vi.fn(),
  searchPublishedTypesByName: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: readers.cacheLife, cacheTag: readers.cacheTag }));
vi.mock('@/data/eve-data/universe-assets', () => ({
  getWormholeCodex: readers.getWormholeCodex,
  getSystemDirectory: readers.getSystemDirectory,
}));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: readers.getSystemStatics }));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: readers.getPricedSiteDetail,
  getSiteSearchIndex: readers.getSiteSearchIndex,
}));
vi.mock('@/data/eve-data/queries', () => ({
  getTypeLabels: readers.getTypeLabels,
  getTypesByIds: readers.getTypesByIds,
  searchPublishedTypesByName: readers.searchPublishedTypesByName,
}));

import { BLUEPRINT_STRUCTURE_TAG } from '@/data/eve-data/constants';
import {
  CODEX_SOURCES,
  codexDataBlockProblems,
  codexSourceCatalogue,
  formatDataBlock,
  resolveDataBlock,
  searchCodexSource,
  type CodexDataBlockAttrs,
} from './codex-sources';

const C247 = {
  code: 'C247',
  typeId: 30691,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 375_000_000,
  massRegen: 0,
  lifetimeMinutes: 960,
  sizeClass: 'L',
  targetClass: 3,
};
const B274 = { ...C247, code: 'B274', typeId: 30001, targetClass: 7 };
const D382 = { ...C247, code: 'D382', typeId: 30002, targetClass: 2, sizeClass: 'M' };
const K162 = { code: 'K162', typeId: 30579, farSide: true };

const SITE = {
  id: 20,
  name: 'Outpost Frontier Stronghold',
  siteType: 'combat',
  wormholeClass: 'C3',
  blueLootIsk: 45_100_000,
  resourceValueIsk: null,
  waves: [{}, {}, {}],
  resources: [],
};

const GAS_SITE = { ...SITE, id: 50, name: 'Bountiful Frontier Reservoir', siteType: 'gas', wormholeClass: null };
const UNPUBLISHED_SITE = { ...SITE, id: 70, name: 'Unreleased Sleeper Cache' };

const GILA = {
  id: 17715,
  name: 'Gila',
  groupName: 'Heavy Assault Cruiser',
  mass: 12_000_000,
  volume: 96_000,
  description: 'Taking <a href=showinfo:1>what</a> he had<br>learned …',
};

function seedEveType(type: typeof GILA) {
  readers.getTypeLabels.mockResolvedValue(new Map([[type.id, { name: type.name, groupName: type.groupName }]]));
  readers.getTypesByIds.mockResolvedValue([
    { id: type.id, mass: type.mass, volume: type.volume, description: type.description },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  readers.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247, B274, D382, K162], effects: [] });
  readers.getSystemDirectory.mockResolvedValue({
    version: 'v',
    systems: [
      { id: 1, whClassId: 3, effect: 'pulsar' },
      { id: 2, whClassId: 3, effect: 'black-hole' },
      { id: 3, whClassId: 3, effect: null },
      { id: 4, whClassId: 2, effect: null },
    ],
  });
  readers.getSystemStatics.mockResolvedValue({
    version: 'v',
    systems: [
      { systemId: 1, codes: ['B274'] },
      { systemId: 2, codes: ['B274', 'D382'] },
      { systemId: 4, codes: ['C247'] },
    ],
  });
  readers.getPricedSiteDetail.mockImplementation(async (id: number) => [SITE, GAS_SITE].find((row) => row.id === id) ?? null);
  readers.getSiteSearchIndex.mockResolvedValue([
    SITE,
    GAS_SITE,
    { id: 21, name: 'Perimeter Ambush Point', siteType: 'combat', wormholeClass: 'C1' },
    UNPUBLISHED_SITE,
  ]);
  seedEveType(GILA);
});

const attrs = (overrides: Partial<CodexDataBlockAttrs>): CodexDataBlockAttrs => ({
  source: 'wormholeType',
  key: 'C247',
  fields: [],
  layout: 'infobox',
  ...overrides,
});

async function rowsFor(overrides: Partial<CodexDataBlockAttrs>) {
  const resolution = resolveDataBlock(attrs(overrides));
  if (!resolution.ok) throw new Error(resolution.reason);
  const row = await CODEX_SOURCES[resolution.source].load(resolution.key);
  return formatDataBlock(resolution, row);
}

const pairs = (view: { rows: readonly { label: string; value: string }[] }) =>
  view.rows.map(({ label, value }) => [label, value]);

describe('wormhole type source', () => {
  it('formats every C247 field the way the page shows it', async () => {
    const view = await rowsFor({
      fields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes', 'massRegen', 'sizeClass'],
    });
    expect(pairs(view)).toEqual([
      ['Leads to', 'C3'],
      ['Total mass', '2,000,000,000 kg'],
      ['Max jump mass', '375,000,000 kg'],
      ['Lifetime', '16 hours'],
      ['Mass regeneration', 'None'],
      ['Size class', 'Large · up to battleships'],
    ]);
    expect(view).toMatchObject({ title: 'C247', href: null, sourceLabel: 'Wormhole type', provenance: 'SDE', icon: 'wormhole' });
  });

  it('names known-space targets, single and fractional hours, regeneration, and unknown classes', async () => {
    const variant = (entry: Record<string, unknown>) =>
      readers.getWormholeCodex.mockResolvedValue({ version: 'v', types: [{ ...C247, ...entry }], effects: [] });
    const fields = ['targetClass', 'lifetimeMinutes', 'massRegen'];

    variant({ targetClass: 7, lifetimeMinutes: 1440 });
    expect(pairs(await rowsFor({ fields }))).toEqual([
      ['Leads to', 'High-sec'],
      ['Lifetime', '24 hours'],
      ['Mass regeneration', 'None'],
    ]);
    variant({ lifetimeMinutes: 60, massRegen: 500_000_000, targetClass: 99 });
    expect(pairs(await rowsFor({ fields }))).toEqual([
      ['Leads to', 'Class 99'],
      ['Lifetime', '1 hour'],
      ['Mass regeneration', '500,000,000 kg / day'],
    ]);
    variant({ lifetimeMinutes: 90 });
    expect(pairs(await rowsFor({ fields: ['lifetimeMinutes'] }))).toEqual([['Lifetime', '1.5 hours']]);
  });

  it('keeps the order the block lists its fields in', async () => {
    const view = await rowsFor({ fields: ['lifetimeMinutes', 'totalMass'] });
    expect(view.rows.map((row) => row.label)).toEqual(['Lifetime', 'Total mass']);
  });
});

describe('site source', () => {
  it('formats the default fields, wave count, missing resources, and links the site page', async () => {
    const defaults = await rowsFor({ source: 'site', key: '20', fields: ['wormholeClass', 'siteType', 'blueLootIsk'] });
    expect(pairs(defaults)).toEqual([
      ['Class', 'C3'],
      ['Type', 'Combat'],
      ['Blue loot', '45.1M ISK'],
    ]);
    expect(defaults.href).toBe('/codex/sites/20');
    const gas = await rowsFor({ source: 'site', key: '50', fields: ['wormholeClass', 'siteType'] });
    expect(pairs(gas)).toEqual([
      ['Class', 'C3–C6'],
      ['Type', 'Gas'],
    ]);
    const more = await rowsFor({ source: 'site', key: '20', fields: ['waves', 'resourceValueIsk'] });
    expect(more.rows.map((row) => row.value)).toEqual(['3', '—']);
  });
});

describe('wormhole class source', () => {
  it('summarises effects, inbound holes, systems, and static targets for a class', async () => {
    const view = await rowsFor({
      source: 'wormholeClass',
      key: 'c3',
      fields: ['effects', 'inbound', 'systemCount', 'staticMix'],
    });
    expect(resolveDataBlock(attrs({ source: 'wormholeClass', key: 'c3', fields: ['effects'] }))).toMatchObject({
      key: 'C3',
      canonicalKey: false,
    });
    expect(view.rows.map((row) => row.value)).toEqual(['Black Hole, Pulsar', 'C247\u00a0(L)', '3', 'High\u2011sec\u00a0×2\u00a0· C2\u00a0×1']);
    const empty = await rowsFor({
      source: 'wormholeClass',
      key: 'C5',
      fields: ['effects', 'inbound', 'systemCount', 'staticMix'],
    });
    expect(empty.rows.map((row) => row.value)).toEqual(['None', 'None', '0', 'None']);
  });
});

describe('item source', () => {
  it('formats mass, volume, and a cleaned, clipped description', async () => {
    const view = await rowsFor({ source: 'eveType', key: '17715', fields: ['name', 'group', 'mass', 'volume', 'description'] });
    expect(pairs(view)).toEqual([
      ['Name', 'Gila'],
      ['Group', 'Heavy Assault Cruiser'],
      ['Mass', '12,000,000 kg'],
      ['Volume', '96,000 m³'],
      ['Description', 'Taking what he had learned …'],
    ]);

    seedEveType({ ...GILA, mass: null as unknown as number, description: `<b>Long</b> ${'word '.repeat(80)}` });
    const long = await rowsFor({ source: 'eveType', key: '17715', fields: ['mass', 'description'] });
    const description = long.rows[1]!.value;
    expect(long.rows[0]!.value).toBe('—');
    expect(description).not.toContain('<');
    expect(description.endsWith('…')).toBe(true);
    expect(description.length).toBeGreaterThan(270);
    expect(description.length).toBeLessThanOrEqual(281);
  });

  it('retries a Neon cold start instead of failing the page', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cold = Object.assign(new Error('Error connecting to database: fetch failed'), { name: 'NeonDbError' });
    readers.getTypesByIds.mockRejectedValueOnce(cold);

    const loading = rowsFor({ source: 'eveType', key: '17715', fields: ['name', 'mass'] });
    await vi.runAllTimersAsync();

    expect(pairs(await loading)).toEqual([
      ['Name', 'Gila'],
      ['Mass', '12,000,000 kg'],
    ]);
    expect(readers.getTypesByIds).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('resolveDataBlock', () => {
  it('refuses unknown sources, keys, layouts, and empty field lists', () => {
    for (const source of ['users', '__proto__', 'constructor', 'toString']) {
      expect(resolveDataBlock(attrs({ source, fields: ['totalMass'] }))).toEqual({ ok: false, reason: 'unknown-source' });
    }
    expect(resolveDataBlock(attrs({ layout: 'card', fields: ['totalMass'] }))).toEqual({
      ok: false,
      reason: 'layout-not-offered',
    });
    expect(resolveDataBlock(attrs({ key: 'xyz', fields: ['totalMass'] }))).toEqual({ ok: false, reason: 'bad-key' });
    expect(resolveDataBlock(attrs({ key: 'K162', fields: ['totalMass'] }))).toEqual({ ok: false, reason: 'bad-key' });
    for (const key of ['99999999999', '2147483648', '0', '01']) {
      for (const source of ['site', 'eveType']) {
        expect(resolveDataBlock(attrs({ source, key, fields: ['name'] })), `${source}:${key}`).toEqual({
          ok: false,
          reason: 'bad-key',
        });
      }
    }
    expect(resolveDataBlock(attrs({ source: 'eveType', key: '2147483647', fields: ['name'] }))).toMatchObject({ ok: true });
    expect(resolveDataBlock(attrs({ fields: [] }))).toEqual({ ok: false, reason: 'no-fields' });
  });

  it('canonicalises keys, drops unknown fields, and lets a site card go without fields', () => {
    expect(resolveDataBlock(attrs({ key: 'c247', fields: ['totalMass', 'bogus'] }))).toEqual({
      ok: true,
      source: 'wormholeType',
      key: 'C247',
      layout: 'infobox',
      fields: ['totalMass'],
      dropped: ['bogus'],
      canonicalKey: false,
    });
    expect(resolveDataBlock(attrs({ source: 'site', key: '20', layout: 'card' }))).toMatchObject({ ok: true, fields: [] });
  });

  it('refuses a site the catalogue has not published', () => {
    expect(resolveDataBlock({ source: 'site', key: '70', fields: ['waves'], layout: 'infobox' })).toEqual({
      ok: false,
      reason: 'bad-key',
    });
    expect(resolveDataBlock({ source: 'site', key: '20', fields: ['waves'], layout: 'infobox' })).toMatchObject({ ok: true });
  });
});

describe('codexDataBlockProblems', () => {
  const paragraph = { type: 'paragraph', attrs: { id: 'p' }, content: [] };
  const block = (overrides: Record<string, unknown>) => ({
    type: 'dataBlock',
    attrs: { id: 'd', source: 'wormholeType', key: 'C247', fields: ['totalMass'], layout: 'infobox', ...overrides },
  });

  it('names each data block that the registry cannot serve', async () => {
    expect(
      await codexDataBlockProblems([paragraph, block({ source: 'ships', key: '1', fields: [] })]),
    ).toEqual(['content.1 (dataBlock): source "ships" is not a Codex data source']);
    expect(await codexDataBlockProblems([block({ key: 'c247' })])).toEqual([
      'content.0 (dataBlock): key "c247" is not a valid Wormhole type key',
    ]);
    expect(await codexDataBlockProblems([block({ layout: 'card' })])).toEqual([
      'content.0 (dataBlock): layout "card" is not offered by Wormhole type',
    ]);
    expect(await codexDataBlockProblems([block({ fields: ['totalMass', 'bogus'] })])).toEqual([
      'content.0 (dataBlock): field "bogus" is not offered by Wormhole type',
    ]);
    expect(await codexDataBlockProblems([block({ fields: [] })])).toEqual([
      'content.0 (dataBlock): no fields were chosen',
    ]);
    expect(await codexDataBlockProblems([block({ key: 'C999' })])).toEqual([
      'content.0 (dataBlock): no entity "C999" in Wormhole type',
    ]);
  });

  it('checks inline values inside paragraphs, lists, and tables, naming where each one sits', async () => {
    const inline = (overrides: Record<string, unknown>) => ({
      type: 'dataInline',
      attrs: { source: 'wormholeType', key: 'C247', fields: ['totalMass'], ...overrides },
    });
    const sentence = (...content: unknown[]) => ({ type: 'paragraph', attrs: {}, content });
    expect(
      await codexDataBlockProblems([
        sentence({ type: 'text', text: 'Take ' }, inline({}), inline({ key: 'C999' })),
        {
          type: 'bulletList',
          attrs: { id: 'l' },
          content: [{ type: 'listItem', attrs: {}, content: [sentence(inline({ source: 'eveType', key: '99999999999' }))] }],
        },
      ]),
    ).toEqual([
      'content.0.content.2 (dataInline): no entity "C999" in Wormhole type',
      'content.1.content.0.content.0.content.0 (dataInline): key "99999999999" is not a valid Item key',
    ]);
  });

  it('walks a deeply nested form without exhausting the stack', async () => {
    let nested: unknown = { type: 'dataInline', attrs: { source: 'wormholeType', key: 'C999', fields: ['totalMass'] } };
    for (let level = 0; level < 5_000; level += 1) nested = { type: 'paragraph', attrs: {}, content: [nested] };
    const problems = await codexDataBlockProblems([nested]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^content\.0(\.content\.0){5000} \(dataInline\): no entity "C999" in Wormhole type$/);
  });

  it('walks a node with a very wide child list without exhausting the stack', async () => {
    expect(await codexDataBlockProblems([{ type: 'paragraph', attrs: {}, content: new Array(200_000).fill(0) }])).toEqual([]);
  });

  it('passes valid blocks and leaves malformed ones to the document parser', async () => {
    expect(
      await codexDataBlockProblems([
        paragraph,
        block({}),
        block({ source: 'eveType', key: '17715', fields: ['mass'] }),
        block({ source: 42 }),
      ]),
    ).toEqual([]);
  });
});

describe('cache contract', () => {
  it('reads cached datasets through their own tagged entries and caches only the uncached item reader', async () => {
    await CODEX_SOURCES.site.load('20');
    await CODEX_SOURCES.wormholeType.load('C247');
    await CODEX_SOURCES.wormholeClass.load('C3');
    expect(readers.getPricedSiteDetail).toHaveBeenCalledWith(20);
    expect(readers.cacheTag).not.toHaveBeenCalled();

    await CODEX_SOURCES.eveType.load('17715');
    expect(readers.cacheTag).toHaveBeenCalledWith(BLUEPRINT_STRUCTURE_TAG);
    expect(readers.cacheLife).toHaveBeenCalledWith('max');
  });
});

describe('searchCodexSource', () => {
  it('searches wormhole codes, never offering K162', async () => {
    expect(await searchCodexSource('wormholeType', 'c2')).toEqual([
      { key: 'C247', title: 'C247', hint: 'Leads to C3 · Large' },
    ]);
    expect(await searchCodexSource('wormholeType', 'k16')).toEqual([]);
    expect(await searchCodexSource('wormholeType', 'zzzz')).toEqual([]);
  });

  it('hints a gas site with the class range its name implies', async () => {
    expect(await searchCodexSource('site', 'bountiful')).toContainEqual({
      key: '50',
      title: 'Bountiful Frontier Reservoir',
      hint: 'C3–C6 · Gas',
    });
  });

  it('never offers an unpublished site', async () => {
    const hits = await searchCodexSource('site', UNPUBLISHED_SITE.name);
    expect(hits!.map((hit) => hit.key)).not.toContain('70');
  });

  it('fuzzy-matches site names', async () => {
    expect(await searchCodexSource('site', 'frontier')).toContainEqual({
      key: '20',
      title: 'Outpost Frontier Stronghold',
      hint: 'C3 · Combat',
    });
  });

  it('asks the item reader only for two or more characters', async () => {
    readers.searchPublishedTypesByName.mockResolvedValue([{ id: 17715, name: 'Gila', groupName: 'Heavy Assault Cruiser' }]);
    expect(await searchCodexSource('eveType', 'g')).toEqual([]);
    expect(readers.searchPublishedTypesByName).not.toHaveBeenCalled();
    expect(await searchCodexSource('eveType', 'gi')).toEqual([
      { key: '17715', title: 'Gila', hint: 'Heavy Assault Cruiser' },
    ]);
  });

  it('names every wormhole class by its short label, Drifter space included', async () => {
    const hits = await searchCodexSource('wormholeClass', 'c1');
    expect(hits!.map((hit) => [hit.key, hit.title])).toEqual([
      ['C1', 'C1'],
      ['C12', 'Thera'],
      ['C13', 'Shattered C13'],
      ['C14', 'Sentinel'],
      ['C15', 'Barbican'],
      ['C16', 'Vidette'],
      ['C17', 'Conflux'],
      ['C18', 'Redoubt'],
    ]);
  });

  it('lists wormhole classes and refuses unknown sources', async () => {
    expect(await searchCodexSource('wormholeClass', 'thera')).toEqual([{ key: 'C12', title: 'Thera', hint: 'Class 12' }]);
    expect(await searchCodexSource('users', 'a')).toBeNull();
    expect(await searchCodexSource('site', '')).toEqual([]);
  });
});

describe('codexSourceCatalogue', () => {
  it('offers the four sources, and the card layout only for sites', () => {
    const { sources } = codexSourceCatalogue();
    expect(sources.map((source) => source.id)).toEqual(['wormholeType', 'site', 'wormholeClass', 'eveType']);
    expect(sources.find((source) => source.id === 'site')!.layouts).toEqual(['infobox', 'table', 'inline', 'card']);
    for (const source of sources.filter((candidate) => candidate.id !== 'site')) {
      expect(source.layouts).toEqual(['infobox', 'table', 'inline']);
    }
    expect(sources.map((source) => source.provenance)).toEqual(['SDE', 'SDE · Prices', 'SDE', 'SDE']);
    expect(sources[0]!.fields.map((field) => field.label)).toEqual([
      'Leads to',
      'Total mass',
      'Max jump mass',
      'Lifetime',
      'Mass regeneration',
      'Size class',
    ]);
  });
});
