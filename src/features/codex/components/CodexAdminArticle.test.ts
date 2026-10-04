import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () => (props: { sectionId: string | null; goneSectionId: string | null; notice: string | null }) =>
    createElement('form', {
      'data-editor': props.sectionId ?? 'page',
      'data-gone-section': props.goneSectionId ?? 'none',
      'data-notice': props.notice ?? 'none',
    }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement('a', { href }, children),
}));

import type { RenderedCodexSection } from '../render';
import { CodexAdminArticle } from './CodexAdminArticle';

const section = (id: string, title: string | null): RenderedCodexSection => ({
  id,
  title,
  heading:
    title === null
      ? null
      : { type: 'heading', attrs: { id, level: 2 }, content: [{ type: 'text', text: title, marks: [] }] },
  blocks: [],
  body: createElement('p', null, `${id} text`),
});

const render = (
  initialScope: string | null,
  conflict: { initialNotice: 'conflict' | null; goneSectionId: string | null } = {
    initialNotice: null,
    goneSectionId: null,
  },
) =>
  renderToStaticMarkup(
    createElement(CodexAdminArticle, {
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      newTitle: null,
      baseRevisionId: 'rev-2',
      header: createElement('h1', null, 'Rolling'),
      aside: null,
      footer: null,
      sections: [section('lead', null), section('ships', 'Ships'), section('route', 'Route')],
      initialScope,
      ...conflict,
    }),
  );

const disabledButtons = (html: string) =>
  [...html.matchAll(/<button([^>]*disabled=""[^>]*)>(.*?)<\/button>/g)].map(
    ([, attrs = '', inner = '']) => /aria-label="([^"]+)"/.exec(attrs)?.[1] ?? inner.replace(/<[^>]+>/g, ''),
  );

test('while one section is in edit, History, Edit page and every other pencil are disabled', () => {
  const html = render('ships');

  expect(html).not.toContain('href="/codex/guides/rolling-a-c3/history"');
  expect(disabledButtons(html)).toEqual(['History', 'Edit page', 'Edit introduction', 'Edit section']);
  expect(html).toContain('Editing');
  expect(html).toContain('data-editor="ships"');
  expect(html).toContain('lead text');
  expect(html).toContain('route text');
  expect(html).not.toContain('ships text');
});

test('while the whole page is in edit, History and Edit page are disabled', () => {
  const html = render('page');

  expect(html).not.toContain('href="/codex/guides/rolling-a-c3/history"');
  expect(disabledButtons(html)).toEqual(['History', 'Edit page']);
  expect(html).toContain('data-editor="page"');
});

test('a page with nothing in edit links History and enables every pencil', () => {
  const html = render(null);

  expect(html).toContain('href="/codex/guides/rolling-a-c3/history"');
  expect(disabledButtons(html)).toEqual([]);
  expect(html.match(/aria-label="Edit section"/g)).toHaveLength(2);
  expect(html).not.toContain('data-editor');
});

test('a conflict on a section the newer page no longer has opens the whole page with the kept text', () => {
  const html = render('page', { initialNotice: 'conflict', goneSectionId: 'gone' });

  expect(html).toContain('data-editor="page" data-gone-section="gone" data-notice="conflict"');
  expect(disabledButtons(html)).toEqual(['History', 'Edit page']);
});
