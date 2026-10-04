import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listCodexPages: vi.fn(async () => []),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/features/codex/queries', () => ({ listCodexPages: mocks.listCodexPages }));

import CodexKindPage, { CodexKindIndex, generateMetadata, generateStaticParams } from './page';

const params = (kind: string) => Promise.resolve({ kind });
const links = (html: string) => [...html.matchAll(/href="(\/codex\/classes\/[^"]+)"/g)].map(([, href]) => href);

test('the class index links every wormhole class in table order', async () => {
  expect(renderToStaticMarkup(CodexKindPage({ params: params('classes') }))).toContain('aria-label="Loading index"');
  const html = renderToStaticMarkup(await CodexKindIndex({ params: params('classes') }));

  const classLinks = links(html);
  expect(classLinks).toHaveLength(13);
  expect(classLinks[0]).toBe('/codex/classes/c1');
  expect(classLinks.filter((href) => href === '/codex/classes/thera')).toHaveLength(1);
  expect(html).toContain('13 classes.');
  expect(await generateMetadata({ params: params('classes') })).toMatchObject({
    title: 'Classes',
    alternates: { canonical: '/codex/classes' },
  });
});

test('names the four kinds for prerendering and 404s anything else', async () => {
  expect(generateStaticParams()).toEqual([
    { kind: 'wormholes' },
    { kind: 'sites' },
    { kind: 'classes' },
    { kind: 'guides' },
  ]);
  for (const kind of ['bogus', 'constructor']) {
    await expect(CodexKindIndex({ params: params(kind) })).rejects.toThrow('NEXT_NOT_FOUND');
  }
});
