import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCodexPage: vi.fn(),
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
}));

import CodexSubjectPage, { CodexReader, generateMetadata } from './page';

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

test('the reader route reaches no Codex admin or editor module', () => {
  const reached = reachableModules('src/app/(site)/codex/[kind]/[key]/page.tsx');
  expect(reached).toContain('src/features/codex/render.tsx');
  expect(
    reached.filter((file) => /src\/features\/codex\/(components\/(CodexAdmin|NewGuideForm)|editor\/)/.test(file)),
  ).toEqual([]);
});

test('only the signed-in Codex route imports the admin article', () => {
  const appFiles = readdirSync('src/app', { recursive: true })
    .map((file) => path.join('src/app', String(file)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
  expect(
    appFiles.filter((file) => /CodexAdminArticle|CodexAdminSlot|CodexEditor/.test(readFileSync(file, 'utf8'))),
  ).toEqual(['src/app/(site)/codex/[kind]/[key]/admin/page.tsx']);
});
