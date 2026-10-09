import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const readers = vi.hoisted(() => ({
  getWormholeCodex: vi.fn(),
  getPricedSiteDetail: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/data/eve-data/universe-assets', () => ({
  getWormholeCodex: readers.getWormholeCodex,
  getSystemDirectory: vi.fn(),
}));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: vi.fn() }));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: readers.getPricedSiteDetail,
  getSiteSearchIndex: vi.fn(),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getTypeLabels: vi.fn(),
  getTypesByIds: vi.fn(),
  searchPublishedTypesByName: vi.fn(),
}));
vi.mock('@/features/wormhole-sites/components/SiteCard', () => ({
  SiteCard: ({ site, presentation }: { site: { name: string }; presentation: string }) =>
    createElement('div', { 'data-site-card': '', 'data-presentation': presentation }, site.name),
}));

import { codexSourceCatalogue, type CodexDataBlockAttrs } from '@/composition/codex-sources';
import { CARD_VIEWS, CodexDataBlock, codexComponentsFor } from './codex-data-block';

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
const SITE = {
  id: 20,
  name: 'Outpost Frontier Stronghold',
  siteType: 'combat',
  wormholeClass: 'C3',
  blueLootIsk: 45_100_000,
  resourceValueIsk: null,
  waves: [],
  resources: [],
};

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  warn.mockClear();
  readers.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247], effects: [] });
  readers.getPricedSiteDetail.mockResolvedValue(SITE);
});

async function render(attrs: Partial<CodexDataBlockAttrs>) {
  const node = await CodexDataBlock({
    attrs: { source: 'wormholeType', key: 'C247', fields: ['targetClass', 'totalMass', 'lifetimeMinutes'], layout: 'infobox', ...attrs },
  });
  return renderToStaticMarkup(createElement('div', null, node)).replace(/^<div>|<\/div>$/g, '');
}

const text = (html: string) => html.replace(/<[^>]+>/g, '');

test('an infobox shows the entity, its source, and each chosen label beside its live value', async () => {
  const html = await render({});
  expect(html).toContain('data-codex-block="wormholeType"');
  expect(html).toContain('data-codex-layout="infobox"');
  expect(text(html)).toContain('C247Wormhole type');
  expect(html).toMatch(/<span>Properties<\/span><span [^>]*>SDE<\/span>/);
  expect(html).toMatch(/<dt [^>]*>Total mass<\/dt><dd [^>]*>2,000,000,000 kg<\/dd>/);
  expect(html).toMatch(/<dt [^>]*>Lifetime<\/dt><dd [^>]*>16 hours<\/dd>/);
  expect(html).not.toContain('style=');
});

test('a table names its entity above the header row of labels and the row of values', async () => {
  const html = await render({ layout: 'table' });
  expect(html).toContain('data-codex-layout="table"');
  expect(text(html)).toMatch(/^C247Wormhole typeLeads to/);
  expect(html).toMatch(/<th>Leads to<\/th><th>Total mass<\/th><th>Lifetime<\/th>/);
  expect(html).toMatch(/<td [^>]*>C3<\/td><td [^>]*>2,000,000,000 kg<\/td><td [^>]*>16 hours<\/td>/);
});

test('an inline value is a span that sits inside the sentence around it', async () => {
  const html = await render({ layout: 'inline', fields: ['totalMass', 'lifetimeMinutes'] });
  expect(html).toMatch(/^<span data-codex-block="wormholeType" data-codex-layout="inline">/);
  expect(html).not.toMatch(/<p|<div|<table|<dl/);
  expect(text(html)).toBe('C247 — total mass 2,000,000,000 kg · lifetime 16 hours');
  expect(await render({ layout: 'inline', key: 'C999' })).toBe(
    '<span data-codex-block="wormholeType" data-codex-missing="">No data for C999.</span>',
  );
});

test('a site renders as the standalone site card or as an infobox linked to the site page', async () => {
  const card = await render({ source: 'site', key: '20', fields: [], layout: 'card' });
  expect(card).toContain('data-site-card=""');
  expect(card).toContain('data-presentation="standalone"');
  const infobox = await render({ source: 'site', key: '20', fields: ['wormholeClass'], layout: 'infobox' });
  expect(infobox).toContain('<a href="/codex/sites/20" class="hover:text-isk">Outpost Frontier Stronghold</a>');
  expect(text(infobox)).toContain('PropertiesSDE · Prices');
});

test('unknown fields drop out with one warning per field per process', async () => {
  const html = await render({ fields: ['totalMass', 'bogus'] });
  expect(text(html)).toContain('Total mass');
  expect(text(html)).not.toContain('Lifetime');
  await render({ fields: ['totalMass', 'bogus'] });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('[codex] data block wormholeType:C247 drops unknown field "bogus"');
});

test('an unknown source renders nothing and warns once; a missing entity says so without warning', async () => {
  expect(await render({ source: 'users' })).toBe('');
  expect(await render({ source: 'users' })).toBe('');
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('[codex] data block skipped: unknown-source', 'users:C247');

  warn.mockClear();
  expect(text(await render({ key: 'C999' }))).toBe('No data for C999.');
  expect(warn).not.toHaveBeenCalled();
});

test('every source that offers the card layout has a card view', () => {
  const offering = codexSourceCatalogue()
    .sources.filter((source) => source.layouts.includes('card'))
    .map((source) => source.id);
  expect(Object.keys(CARD_VIEWS)).toEqual(offering);
  expect(offering).toEqual(['site']);
});

test('an image renders its stored widths with the caption and credit, or a placeholder when unavailable', () => {
  const stem = 'https://s.public.blob.vercel-storage.com/codex/local/img/ab12';
  const assetId = '0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10';
  const assets = new Map([
    [assetId, { id: assetId, stem, width: 1920, height: 1080, status: 'published' as const, credit: 'Karaka Haginen' }],
  ]);
  const { image } = codexComponentsFor(assets);
  const attrs = { id: 'i1', assetId, alt: 'Gila holding at 30 km', caption: 'Wave 2 drifts in.' };

  const shown = renderToStaticMarkup(createElement('div', null, image({ attrs, children: null })));
  expect(shown).toContain('alt="Gila holding at 30 km"');
  expect(shown).toContain(`${stem}-640.webp 640w`);
  expect(shown).not.toContain('/_next/image');
  expect(shown).toContain('Wave 2 drifts in.');
  expect(shown).toContain('Screenshot by Karaka Haginen');

  const missing = renderToStaticMarkup(
    createElement('div', null, image({ attrs: { ...attrs, assetId: 'other' }, children: null })),
  );
  expect(missing).toContain('Image unavailable');
  expect(missing).not.toContain('<img');
});
