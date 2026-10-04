import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

// A minimal hook store lets a test press a button by calling its handler and render again.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: <T>(init: T) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = init;
    const set = (next: T) => {
      hooks.states[index] = next;
    };
    return [hooks.states[index], set];
  },
}));
vi.mock('next/dynamic', () => ({
  default:
    (_load: unknown, options: { loading: () => ReactNode }) =>
    (props: { sectionId: string | null; goneSectionId: string | null; notice: string | null }) =>
      createElement(
        'form',
        {
          'data-editor': props.sectionId ?? 'page',
          'data-gone-section': props.goneSectionId ?? 'none',
          'data-notice': props.notice ?? 'none',
        },
        options.loading(),
      ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement('a', { href }, children),
}));

import type { RenderedCodexSection } from '../render';
import { CodexAdminArticle } from './CodexAdminArticle';

const section = (id: string, title: string | null, empty = false, lifted = false): RenderedCodexSection => ({
  id,
  title,
  empty,
  lifted,
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
) => {
  hooks.states = [];
  hooks.cursor = 0;
  return renderToStaticMarkup(
    createElement(CodexAdminArticle, {
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      newTitle: null,
      baseRevisionId: 'rev-2',
      header: createElement('h1', null, 'Rolling'),
      aside: null,
      footer: null,
      sections: [section('lead', null), section('ships', 'Ships'), section('route', 'Route')],
      initialScope,
      catalogue: { sources: [] },
      ...conflict,
    }),
  );
};

const disabledButtons = (html: string) =>
  [...html.matchAll(/<button([^>]*disabled=""[^>]*)>(.*?)<\/button>/g)].map(
    ([, attrs = '', inner = '']) => /aria-label="([^"]+)"/.exec(attrs)?.[1] ?? inner.replace(/<[^>]+>/g, ''),
  );

test('while one section is in edit, History, Edit page and every other pencil are disabled', () => {
  const html = render('ships');

  expect(html).not.toContain('href="/codex/guides/rolling-a-c3/history"');
  expect(disabledButtons(html)).toEqual(['History', 'Edit page', 'Edit introduction', 'Edit section']);
  expect(html).toContain('Editing');
  expect(html).toContain('<section id="ships" class="scroll-mt-24 pt-10 first:pt-0 clear-right">');
  expect(html).toContain('</header><form data-editor="ships"');
  expect(html).toContain('<section id="route" class="scroll-mt-24 pt-10 first:pt-0">');
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

const templateProps = {
  subject: { kind: 'wormholes', key: 'c247' },
  newTitle: null,
  baseRevisionId: null,
  header: createElement('h1', null, 'C247'),
  aside: null,
  footer: null,
  sections: [
    section('lead', null, false, true),
    section('overview', 'Overview', true),
    section('where-it-appears', 'Where it appears', true),
    section('rolling-and-mass', 'Rolling and mass', true),
  ],
  initialScope: null,
  initialNotice: null,
  catalogue: { sources: [] },
} as const;

type Props = { id?: string; onClick?: () => void; children?: ReactNode } & Record<string, unknown>;

function* elements(node: unknown, sectionId: string | null): Generator<{ props: Props; sectionId: string | null }> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child, sectionId);
    return;
  }
  if (!isValidElement(node)) return;
  const props = node.props as Props;
  const inSection = typeof props.id === 'string' && 'title' in props ? props.id : sectionId;
  yield { props, sectionId: inSection };
  for (const value of Object.values(props)) yield* elements(value, inSection);
}

const text = (node: ReactNode): string =>
  typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text((node.props as Props).children) : '';

const sectionHtml = (html: string, id: string) =>
  new RegExp(`<section id="${id}"[^>]*>(.*?)</section>`).exec(html)?.[1] ?? '';

test('an unwritten section offers to write it, and pressing that opens the editor only there', () => {
  hooks.states = [];
  hooks.cursor = 0;
  const tree = CodexAdminArticle(templateProps);
  const writeButtons = [...elements(tree, null)].filter(({ props }) => text(props.children) === 'Write section');
  expect(writeButtons.map(({ sectionId }) => sectionId)).toEqual(['overview', 'where-it-appears', 'rolling-and-mass']);

  writeButtons.find(({ sectionId }) => sectionId === 'where-it-appears')!.props.onClick!();
  hooks.cursor = 0;
  const html = renderToStaticMarkup(createElement(CodexAdminArticle, templateProps));

  expect(html.match(/Loading editor/g)).toHaveLength(1);
  expect(sectionHtml(html, 'where-it-appears')).toContain('Loading editor');
  expect(html.match(/No guide yet\./g)).toHaveLength(2);
});

test('an unwritten page has no history to open yet', () => {
  hooks.states = [];
  hooks.cursor = 0;
  const html = renderToStaticMarkup(createElement(CodexAdminArticle, templateProps));

  expect(html.match(/Write section/g)).toHaveLength(3);
  expect(disabledButtons(html)).toEqual(['History']);
  expect(html).not.toContain('/history');
});

test('a lead whose only block lifts into the side column offers no pencil', () => {
  hooks.states = [];
  hooks.cursor = 0;
  const html = renderToStaticMarkup(createElement(CodexAdminArticle, templateProps));
  expect(html).not.toContain('Edit introduction');
  expect(html).not.toContain('lead text');
  expect(html.match(/aria-label="Edit section"/g)).toHaveLength(3);
  expect(render(null)).toContain('aria-label="Edit introduction"');
});

test('an empty guide section keeps its bare body instead of the entity placeholder', () => {
  hooks.states = [];
  hooks.cursor = 0;
  const html = renderToStaticMarkup(
    createElement(CodexAdminArticle, {
      ...templateProps,
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      baseRevisionId: 'rev-2',
      sections: [section('lead', null), section('scanning', 'Scanning', true)],
    }),
  );
  expect(html).not.toContain('No guide yet');
  expect(html).not.toContain('Write section');
  expect(sectionHtml(html, 'scanning')).toContain('scanning text');
});
