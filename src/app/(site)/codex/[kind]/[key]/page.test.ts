import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  credits: [] as { characterId: number; name: string; edits: number }[],
  loadCodexPage: vi.fn(),
  getWormholeCodex: vi.fn(),
  getSystemDirectory: vi.fn(),
  getSystemStatics: vi.fn(),
  getPricedSiteDetail: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/features/codex/queries', () => ({
  loadCodexPage: (subject: unknown) => mocks.loadCodexPage(subject),
  listCodexPages: async () => [],
  listCodexCredits: async () => mocks.credits,
}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/data/eve-data/universe-assets', () => ({
  getWormholeCodex: mocks.getWormholeCodex,
  getSystemDirectory: mocks.getSystemDirectory,
}));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: mocks.getSystemStatics }));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: mocks.getPricedSiteDetail,
  getSiteSearchIndex: mocks.getSiteSearchIndex,
}));

import CodexSubjectPage, { CodexReader, generateMetadata, generateStaticParams } from './page';

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
const UNPUBLISHED = { ...SITE, id: 70, name: 'Unreleased Sleeper Cache' };

beforeEach(() => {
  mocks.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247], effects: [] });
  mocks.getSystemDirectory.mockResolvedValue({ version: 'v', systems: [] });
  mocks.getSystemStatics.mockResolvedValue({ version: 'v', systems: [] });
  mocks.getPricedSiteDetail.mockImplementation(async (id: number) => [SITE, UNPUBLISHED].find((row) => row.id === id) ?? null);
  mocks.getSiteSearchIndex.mockResolvedValue([SITE, UNPUBLISHED]);
});

const params = (kind: string, key: string) => Promise.resolve({ kind, key });

const page = {
  title: 'Rolling a C3 static',
  updatedAt: new Date('2026-10-01T23:30:00Z'),
  doc: {
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [
      { type: 'paragraph', attrs: { id: 'intro' }, content: [{ type: 'text', text: 'Start here.', marks: [] }] },
      { type: 'heading', attrs: { id: 'ships', level: 2 }, content: [{ type: 'text', text: 'Ships', marks: [] }] },
      { type: 'heading', attrs: { id: 'route', level: 2 }, content: [{ type: 'text', text: 'Route', marks: [] }] },
    ],
  },
};

test('reader renders a guide with breadcrumb, sections, and outline, and 404s bad addresses', async () => {
  mocks.loadCodexPage.mockResolvedValue(page);
  expect(renderToStaticMarkup(CodexSubjectPage({ params: params('guides', 'rolling-a-c3') }))).toContain(
    'aria-label="Loading page"',
  );

  const html = renderToStaticMarkup(await CodexReader({ params: params('guides', 'rolling-a-c3') }));

  expect(mocks.loadCodexPage).toHaveBeenCalledWith({ kind: 'guides', key: 'rolling-a-c3' });
  const breadcrumb = /<nav aria-label="Breadcrumb"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? '';
  expect(/<a [^>]*>/.exec(breadcrumb)?.[0]).toContain('href="/codex"');
  expect(breadcrumb.replace(/<[^>]+>/g, '')).toBe('Codex/Guides/Rolling a C3 static');
  expect(html).toContain('Updated 1 October 2026');
  expect(html).toContain('<section id="ships"');
  expect(html).toContain('href="#ships"');
  expect(html).toContain('href="#route"');
  expect(html).toContain('<p>Start here.</p>');
  expect(html).not.toContain('No guide yet');

  expect(await generateMetadata({ params: params('guides', 'rolling-a-c3') })).toMatchObject({
    title: 'Rolling a C3 static',
    alternates: { canonical: '/codex/guides/rolling-a-c3' },
  });

  mocks.loadCodexPage.mockClear();
  await expect(CodexReader({ params: params('unknown-kind', 'x') })).rejects.toThrow('NEXT_NOT_FOUND');
  await expect(CodexReader({ params: params('guides', 'Bad Slug') })).rejects.toThrow('NEXT_NOT_FOUND');
  await expect(CodexReader({ params: params('constructor', 'x') })).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.loadCodexPage).not.toHaveBeenCalled();

  mocks.loadCodexPage.mockResolvedValue(null);
  await expect(CodexReader({ params: params('guides', 'missing') })).rejects.toThrow('NEXT_NOT_FOUND');
});

const breadcrumbOf = (html: string) => /<nav aria-label="Breadcrumb"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? '';

test('an unwritten wormhole type renders its template with the infobox beside empty sections', async () => {
  mocks.loadCodexPage.mockResolvedValue(null);
  const html = renderToStaticMarkup(await CodexReader({ params: params('wormholes', 'c247') }));

  const breadcrumb = breadcrumbOf(html);
  expect(breadcrumb.replace(/<[^>]+>/g, '')).toBe('Codex/Wormholes/C247');
  expect(breadcrumb).toContain('href="/codex/wormholes"');
  expect(html).toContain('Not written yet');
  expect(html.match(/No guide yet\./g)).toHaveLength(3);
  expect(/lg:w-\[320px\]">(.*?)<\/div>/.exec(html)?.[1]).toContain('aria-label="Loading data"');
  expect(html).not.toContain('On this page');
  expect(html).not.toContain('<button');
  expect(html).toContain('"@type":"BreadcrumbList"');

  expect(await generateMetadata({ params: params('wormholes', 'c247') })).toMatchObject({
    title: 'C247',
    description: 'C247: Leads to C3 · Total mass 2,000,000,000 kg · Max jump mass 375,000,000 kg.',
    alternates: { canonical: '/codex/wormholes/c247' },
  });
});

test('a written entity page places its leading infobox once, in the side column outside the floating prose', async () => {
  mocks.loadCodexPage.mockResolvedValue({
    title: 'C247',
    revisionId: 'r1',
    updatedAt: new Date('2026-10-01T23:30:00Z'),
    doc: {
      type: 'doc',
      attrs: { schemaVersion: 1 },
      content: [
        {
          type: 'dataBlock',
          attrs: { id: 'data', source: 'wormholeType', key: 'C247', fields: ['targetClass'], layout: 'infobox' },
          content: [],
        },
        { type: 'paragraph', attrs: { id: 'intro' }, content: [{ type: 'text', text: 'Rolls fast.', marks: [] }] },
        { type: 'heading', attrs: { id: 'overview', level: 2 }, content: [{ type: 'text', text: 'Overview', marks: [] }] },
      ],
    },
  });
  const html = renderToStaticMarkup(await CodexReader({ params: params('wormholes', 'c247') }));

  expect(html.match(/aria-label="Loading data"/g)).toHaveLength(1);
  const article = /<article class="flow-root [^"]*">(.*)<\/article>/.exec(html)?.[1] ?? '';
  expect(article).toContain('<div class="codex-prose"><p>Rolls fast.</p></div>');
  expect(article).not.toContain('Loading data');
  expect(/lg:w-\[320px\]">(.*?)<\/div>/.exec(html.slice(html.indexOf('</article>')))?.[1]).toContain(
    'aria-label="Loading data"',
  );
});

test('an unwritten site keeps its card at the top of the reading column', async () => {
  mocks.loadCodexPage.mockResolvedValue(null);
  const html = renderToStaticMarkup(await CodexReader({ params: params('sites', '20') }));

  const card = html.indexOf('aria-label="Loading data"');
  expect(card).toBeGreaterThan(-1);
  expect(card).toBeLessThan(html.indexOf('<section id="waves"'));
  expect(html).toContain('href="#waves"');
});

test('unknown, uppercase, and unpublished entity addresses 404', async () => {
  mocks.loadCodexPage.mockResolvedValue(null);
  for (const [kind, key] of [
    ['wormholes', 'C247'],
    ['wormholes', 'x999'],
    ['sites', '70'],
    ['classes', 'c7'],
  ] as const) {
    await expect(CodexReader({ params: params(kind, key) }), `${kind}/${key}`).rejects.toThrow('NEXT_NOT_FOUND');
  }
});

test('prerenders every entity page and no guide', async () => {
  const all = await generateStaticParams();
  expect(all).toContainEqual({ kind: 'classes', key: 'thera' });
  expect(all).toContainEqual({ kind: 'wormholes', key: 'c247' });
  expect(all).toContainEqual({ kind: 'sites', key: '20' });
  expect(all).not.toContainEqual({ kind: 'sites', key: '70' });
  expect(all.filter((entry) => entry.kind === 'guides')).toEqual([]);
});

test('prerenders a wormhole code the SDE lists under several types once', async () => {
  mocks.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247, { ...C247, typeId: 30692 }], effects: [] });
  const all = await generateStaticParams();
  expect(all.filter((entry) => entry.kind === 'wormholes')).toEqual([{ kind: 'wormholes', key: 'c247' }]);
  expect(new Set(all.map(({ kind, key }) => `${kind}/${key}`)).size).toBe(all.length);
});

function resolveImport(from: string, specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith('@/')) base = path.join('src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.join(path.dirname(from), specifier);
  if (base === null) return null;
  return ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find((file) => existsSync(file)) ?? null;
}

function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:from|import\()\s*'([^']+)'/g)) {
      const resolved = resolveImport(file, specifier!);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

const ADMIN_MODULE = /src\/features\/codex\/(components\/(CodexAdmin|NewGuideForm)|editor\/)/;

test('the reader routes reach no Codex admin or editor module', () => {
  const reached = reachableModules('src/app/(site)/codex/[kind]/[key]/page.tsx');
  expect(reached).toContain('src/features/codex/render.tsx');
  expect(reached.filter((file) => ADMIN_MODULE.test(file))).toEqual([]);

  const home = reachableModules('src/app/(site)/codex/page.tsx');
  expect(home).toContain('src/app/(site)/codex/codex-index.tsx');
  expect(home.filter((file) => ADMIN_MODULE.test(file))).toEqual([]);
  expect(reachableModules('src/app/(site)/codex/edit/page.tsx')).toContain(
    'src/features/codex/components/NewGuideForm.tsx',
  );
});

test('only the signed-in Codex route and the admin merge review reach the admin article or the editor', () => {
  const appFiles = readdirSync('src/app', { recursive: true })
    .map((file) => path.join('src/app', String(file)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
  expect(
    appFiles.filter((file) => /\b(CodexAdminArticle|CodexAdminSlot|CodexEditor)\b/.test(readFileSync(file, 'utf8'))),
  ).toEqual([
    'src/app/(site)/admin/codex/[proposalId]/ConflictResolver.tsx',
    'src/app/(site)/codex/[kind]/[key]/edit/page.tsx',
  ]);
});
