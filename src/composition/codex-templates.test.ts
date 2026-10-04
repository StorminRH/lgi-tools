import { beforeEach, expect, test, vi } from 'vitest';

const readers = vi.hoisted(() => ({
  getWormholeCodex: vi.fn(),
  getSystemDirectory: vi.fn(),
  getSystemStatics: vi.fn(),
  getPricedSiteDetail: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  listCodexPages: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/data/eve-data/universe-assets', () => ({
  getWormholeCodex: readers.getWormholeCodex,
  getSystemDirectory: readers.getSystemDirectory,
}));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: readers.getSystemStatics }));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: readers.getPricedSiteDetail,
  getSiteSearchIndex: readers.getSiteSearchIndex,
}));
vi.mock('@/features/codex/queries', () => ({ listCodexPages: readers.listCodexPages }));

import { parseCodexDoc, type CodexDoc } from '@/features/codex/doc';
import { CODEX_CLASS_KEYS } from '@/features/codex/subjects';
import { deriveSiteMeta } from '@/features/wormhole-sites/site-meta';
import type { SiteDetail } from '@/features/wormhole-sites/types';
import { resolveDataBlock, type CodexDataBlockAttrs } from './codex-sources';
import { CODEX_CLASS_SUBJECTS, codexTemplate, listCodexEntries } from './codex-templates';

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
const UNPUBLISHED = { ...SITE, id: 70, name: 'Unreleased Sleeper Cache' };

beforeEach(() => {
  vi.clearAllMocks();
  readers.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247, K162], effects: [] });
  readers.getSystemDirectory.mockResolvedValue({ version: 'v', systems: [{ id: 1, whClassId: 5, effect: 'pulsar' }] });
  readers.getSystemStatics.mockResolvedValue({ version: 'v', systems: [] });
  readers.getPricedSiteDetail.mockImplementation(
    async (id: number) => [SITE, UNPUBLISHED].find((row) => row.id === id) ?? null,
  );
  readers.getSiteSearchIndex.mockResolvedValue([SITE, UNPUBLISHED]);
});

async function template(kind: 'wormholes' | 'sites' | 'classes' | 'guides', key: string) {
  const built = await codexTemplate({ kind, key });
  if (!built) throw new Error(`no template for ${kind}/${key}`);
  return built;
}

const headings = (doc: CodexDoc, attr: 'id' | 'text') =>
  doc.content.flatMap((block) =>
    block.type === 'heading'
      ? [attr === 'id' ? block.attrs.id : block.content.map((node) => (node.type === 'text' ? node.text : '')).join('')]
      : [],
  );

function expectServable(doc: CodexDoc) {
  expect(parseCodexDoc(doc).ok).toBe(true);
  const [block] = doc.content;
  if (block?.type !== 'dataBlock') throw new Error('the template must open with a data block');
  expect(resolveDataBlock(block.attrs as CodexDataBlockAttrs).ok).toBe(true);
}

test('a wormhole type opens with its full infobox and three empty sections', async () => {
  const c247 = await template('wormholes', 'c247');
  expect(c247.title).toBe('C247');
  expect(c247.doc.content[0]).toEqual({
    type: 'dataBlock',
    attrs: {
      id: 'data',
      source: 'wormholeType',
      key: 'C247',
      fields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes', 'massRegen', 'sizeClass'],
      layout: 'infobox',
    },
    content: [],
  });
  expect(headings(c247.doc, 'id')).toEqual(['overview', 'where-it-appears', 'rolling-and-mass']);
  expect(headings(c247.doc, 'text')).toEqual(['Overview', 'Where it appears', 'Rolling and mass']);
  expect(c247.description).toBe('C247: Leads to C3 · Total mass 2,000,000,000 kg · Max jump mass 375,000,000 kg.');
  expectServable(c247.doc);
});

test('a site opens with its card and the waves, strategy, and videos sections', async () => {
  const site = await template('sites', '20');
  expect(site.doc.content[0]).toEqual({
    type: 'dataBlock',
    attrs: { id: 'data', source: 'site', key: '20', fields: [], layout: 'card' },
    content: [],
  });
  expect(headings(site.doc, 'text')).toEqual(['Waves', 'Strategy', 'Videos']);
  expect(site.description).toBe(deriveSiteMeta(SITE as unknown as SiteDetail).description);
  expectServable(site.doc);
});

test('a class opens with its infobox under the class id, named by the class table', async () => {
  const c5 = await template('classes', 'c5');
  expect(c5.doc.content[0]).toEqual({
    type: 'dataBlock',
    attrs: {
      id: 'data',
      source: 'wormholeClass',
      key: 'C5',
      fields: ['effects', 'inbound', 'systemCount', 'staticMix'],
      layout: 'infobox',
    },
    content: [],
  });
  expect(headings(c5.doc, 'text')).toEqual(['Effects', 'Statics', 'Sites']);
  expectServable(c5.doc);

  const thera = await template('classes', 'thera');
  expect(thera.doc.content[0]).toMatchObject({ attrs: { key: 'C12' } });
  expect(thera.title).toBe('Thera');
  const sentinel = await template('classes', 'sentinel');
  expect(sentinel.doc.content[0]).toMatchObject({ attrs: { key: 'C14' } });
  expect(sentinel.title).toBe('Sentinel');
});

test('unpublished sites, unknown types, and guides have no template', async () => {
  expect(await codexTemplate({ kind: 'sites', key: '70' })).toBeNull();
  expect(await codexTemplate({ kind: 'wormholes', key: 'x999' })).toBeNull();
  expect(await codexTemplate({ kind: 'guides', key: 'x' })).toBeNull();
});

test('lists every entity page a kind offers', async () => {
  expect((await listCodexEntries('classes')).map((entry) => entry.key)).toEqual([...CODEX_CLASS_KEYS]);
  expect(CODEX_CLASS_SUBJECTS.map((entry) => entry.key)).toEqual([...CODEX_CLASS_KEYS]);

  const sites = await listCodexEntries('sites');
  expect(sites).toEqual([{ key: '20', title: 'Outpost Frontier Stronghold' }]);

  const wormholes = await listCodexEntries('wormholes');
  expect(wormholes).toContainEqual({ key: 'c247', title: 'C247' });
  expect(wormholes.map((entry) => entry.key)).not.toContain('k162');

  readers.listCodexPages.mockResolvedValue([
    { key: 'rolling-a-c3', title: 'Rolling a C3 static', updatedAt: new Date('2026-10-01T00:00:00Z') },
  ]);
  expect(await listCodexEntries('guides')).toEqual([{ key: 'rolling-a-c3', title: 'Rolling a C3 static' }]);
});

test('lists a wormhole code the SDE carries under several types once', async () => {
  readers.getWormholeCodex.mockResolvedValue({
    version: 'v',
    types: [C247, { ...C247, typeId: 30692 }, K162],
    effects: [],
  });
  const keys = (await listCodexEntries('wormholes')).map((entry) => entry.key);
  expect(keys).toEqual(['c247']);
  expect(new Set(keys).size).toBe(keys.length);
});
