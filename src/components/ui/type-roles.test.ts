import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { cn } from './cn';
import { PageHead } from './page-head';
import { SectionHead } from './section-head';
import { dataLabel, displayTitle, eyebrow, pageTitle } from './type-roles';

function classSet(classes: string | undefined): string[] {
  return (classes ?? '').split(/\s+/).filter(Boolean).sort();
}

function classOf(markup: string, tag: string): string | undefined {
  return new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(markup)?.[1];
}

test('the page title keeps the classes PageHead and SectionHead rendered before it moved', () => {
  expect(pageTitle({ size: 'compact' })).toBe(
    'font-display font-bold leading-none tracking-optical uppercase text-name text-h2',
  );
  // PageTitle goes through cn(), whose text size drops leading-none: the size
  // token's line height applies. Setting it solid is a design call, not phase 1.
  for (const size of ['hero', 'page', 'compact'] as const) {
    expect(classSet(cn(pageTitle({ size })))).not.toContain('leading-none');
  }

  const page = renderToStaticMarkup(createElement(PageHead, { title: 'Settings' }));
  expect(classSet(classOf(page, 'h1'))).toEqual(
    classSet('font-display font-bold tracking-optical uppercase text-name text-title'),
  );

  const hero = renderToStaticMarkup(createElement(PageHead, { title: 'Market', size: 'hero' }));
  expect(classSet(classOf(hero, 'h1'))).toEqual(
    classSet('font-display font-bold tracking-optical uppercase text-name text-display'),
  );

  const section = renderToStaticMarkup(createElement(SectionHead, { title: 'Characters' }));
  expect(classSet(classOf(section, 'h2'))).toEqual(
    classSet('font-display text-h2 font-bold uppercase leading-none tracking-optical text-name'),
  );

  const compact = renderToStaticMarkup(
    createElement(PageHead, { title: 'Primitives', subtitle: 'size=compact', size: 'compact' }),
  );
  expect(classSet(classOf(compact, 'p'))).toEqual(
    classSet('mt-2 text-muted font-data text-label tracking-label uppercase'),
  );
});

test('the eyebrow keeps its interface defaults and its inherit values emit no class', () => {
  expect(eyebrow()).toBe('uppercase font-ui text-label text-muted font-medium tracking-wide');
  expect(eyebrow({ font: 'inherit', tone: 'inherit', weight: 'inherit' })).toBe(
    'uppercase text-label tracking-wide',
  );
  expect(eyebrow({ font: 'data', weight: 'bold', emphasis: 'label' })).toBe(
    'uppercase font-data text-label text-muted font-bold tracking-label',
  );
  expect(cn(eyebrow(), 'tracking-[0.07em]')).toBe(
    'uppercase font-ui text-label text-muted font-medium tracking-[0.07em]',
  );
});

test('the data label is the data-face eyebrow at label tracking, open to every axis', () => {
  expect(dataLabel()).toBe('uppercase font-data text-label text-muted tracking-label');
  expect(dataLabel({ size: 'micro', tone: 'faint', emphasis: 'strong', className: 'truncate' })).toBe(
    'uppercase font-data text-micro text-faint tracking-eyebrow truncate',
  );
});

test('the display title stays the dialog and panel title role', () => {
  expect(displayTitle()).toBe('font-display font-semibold tracking-copy uppercase text-h2 text-name');
  expect(displayTitle({ size: 'h3', tone: 'danger', wrap: true })).toBe(
    'font-display font-semibold tracking-copy uppercase text-h3 text-pill-red-text min-w-0 break-words',
  );
});
