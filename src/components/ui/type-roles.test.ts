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

test('the page title sets the display face in normal case at optical tracking', () => {
  expect(pageTitle({ size: 'compact' })).toBe(
    'font-display font-bold leading-none tracking-optical text-name text-h2',
  );
  // PageTitle goes through cn(), whose text size drops leading-none: the size
  // token's line height applies. Setting it solid is a design call, not phase 1.
  for (const size of ['hero', 'page', 'compact'] as const) {
    expect(classSet(cn(pageTitle({ size })))).not.toContain('leading-none');
  }

  const page = renderToStaticMarkup(createElement(PageHead, { title: 'Settings' }));
  expect(classSet(classOf(page, 'h1'))).toEqual(
    classSet('font-display font-bold tracking-optical text-name text-title'),
  );

  const hero = renderToStaticMarkup(createElement(PageHead, { title: 'Market', size: 'hero' }));
  expect(classSet(classOf(hero, 'h1'))).toEqual(
    classSet('font-display font-bold tracking-optical text-name text-display'),
  );

  const section = renderToStaticMarkup(createElement(SectionHead, { title: 'Characters' }));
  expect(classSet(classOf(section, 'h2'))).toEqual(
    classSet('font-display text-h2 font-bold leading-none tracking-optical text-name'),
  );

  const compact = renderToStaticMarkup(
    createElement(PageHead, { title: 'Primitives', subtitle: 'size=compact', size: 'compact' }),
  );
  expect(classSet(classOf(compact, 'p'))).toEqual(
    classSet('mt-2 text-muted font-data text-small tracking-normal'),
  );
});

test('the eyebrow keeps its interface defaults and its inherit values emit no class', () => {
  expect(eyebrow()).toBe('tracking-optical font-ui text-eyebrow text-muted font-medium');
  expect(eyebrow({ size: 'micro' })).toBe('tracking-optical font-ui text-caption text-muted font-medium');
  expect(eyebrow({ font: 'inherit', tone: 'inherit', weight: 'inherit' })).toBe(
    'tracking-optical text-eyebrow',
  );
  expect(cn(eyebrow(), 'text-bar')).toBe('tracking-optical font-ui text-muted font-medium text-bar');
});

test('no label or title role sets text in capitals', () => {
  for (const classes of [
    eyebrow(),
    eyebrow({ size: 'micro' }),
    dataLabel(),
    dataLabel({ size: 'micro' }),
    pageTitle(),
    displayTitle(),
  ]) {
    expect(classSet(classes)).not.toContain('uppercase');
  }
});

test('the data label is the data face at normal tracking, open to size and tone', () => {
  expect(dataLabel()).toBe('font-data tracking-normal text-small text-muted');
  expect(dataLabel({ size: 'micro', tone: 'faint', className: 'truncate' })).toBe(
    'font-data tracking-normal text-caption text-faint truncate',
  );
});

test('the display title stays the dialog and panel title role', () => {
  expect(displayTitle()).toBe('font-display font-semibold tracking-optical text-h2 text-name');
  expect(displayTitle({ size: 'h3', tone: 'danger', wrap: true })).toBe(
    'font-display font-semibold tracking-optical text-h3 text-pill-red-text min-w-0 break-words',
  );
});
