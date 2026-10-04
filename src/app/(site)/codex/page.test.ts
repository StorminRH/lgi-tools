import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const listCodexPages = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/features/codex/queries', () => ({ listCodexPages }));

import CodexIndexPage, { metadata } from './page';

test('index lists guides and says so when there are none', async () => {
  expect(metadata.alternates?.canonical).toBe('/codex');
  listCodexPages.mockResolvedValue([]);
  const empty = renderToStaticMarkup(await CodexIndexPage());
  expect(listCodexPages).toHaveBeenCalledWith('guides');
  expect(empty).toContain('No guides yet.');

  listCodexPages.mockResolvedValue([
    { key: 'rolling-a-c3', title: 'Rolling a C3 static', updatedAt: new Date('2026-10-01T00:00:00Z') },
  ]);
  const listed = renderToStaticMarkup(await CodexIndexPage());
  expect(listed).toContain('href="/codex/guides/rolling-a-c3"');
  expect(listed).toContain('>Rolling a C3 static</a>');
  expect(listed).not.toContain('No guides yet.');
});
