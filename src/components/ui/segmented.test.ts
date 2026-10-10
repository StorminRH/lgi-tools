import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    className,
    children,
    'aria-current': ariaCurrent,
  }: {
    href: string;
    scroll?: boolean;
    className?: string;
    children?: ReactNode;
    'aria-current'?: 'page';
  }) =>
    createElement(
      'a',
      { 'data-next-link': '', 'data-scroll': String(scroll), href, 'aria-current': ariaCurrent, className },
      children,
    ),
}));

import { SegmentedControl } from './segmented';

const ACTIVE_FILL = ['border-border-active', 'bg-row-on', 'text-isk', 'shadow-card-edge'];

function segmentTag(html: string, tag: 'a' | 'button', label: string): string {
  return (
    [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([^<]*)</${tag}>`, 'g'))].find(
      ([, , text]) => text === label,
    )?.[1] ?? ''
  );
}

function segmentClasses(html: string, tag: 'a' | 'button', label: string): string[] {
  return (segmentTag(html, tag, label).match(/class="([^"]+)"/)?.[1] ?? '').split(' ');
}

it('raises the selected segment with the active fill in toggle and link modes', () => {
  const toggles = renderToStaticMarkup(
    createElement(SegmentedControl, {
      label: 'Display unit',
      value: 'volume',
      onChange: vi.fn(),
      options: [
        { value: 'isk', label: 'ISK' },
        { value: 'volume', label: 'm3' },
      ],
    }),
  );
  expect(toggles).toContain('aria-label="Display unit"');
  const pressed = segmentClasses(toggles, 'button', 'm3');
  expect(pressed).toEqual(expect.arrayContaining([...ACTIVE_FILL, 'px-3', 'text-nav']));
  expect(pressed).not.toContain('text-muted');
  const idle = segmentClasses(toggles, 'button', 'ISK');
  expect(idle).toEqual(expect.arrayContaining(['border-transparent', 'text-muted', 'hover:text-text']));
  expect(idle).not.toContain('text-isk');

  const links = renderToStaticMarkup(
    createElement(SegmentedControl, {
      label: 'Reference sections',
      value: 'tags',
      density: 'compact',
      options: [
        { value: 'forms', label: 'Forms', href: '#forms' },
        { value: 'tags', label: 'Tags', href: '#tags' },
      ],
    }),
  );
  expect(links).toContain('aria-current="page"');
  const current = segmentClasses(links, 'a', 'Tags');
  expect(current).toEqual(expect.arrayContaining([...ACTIVE_FILL, 'px-2', 'text-label']));
  expect(current).not.toContain('text-muted');
  const other = segmentClasses(links, 'a', 'Forms');
  expect(other).toEqual(expect.arrayContaining(['text-muted', 'hover:text-text']));
  expect(other).not.toContain('bg-row-on');
});

it('soft-navigates linked segments in place and leaves unlinked or disabled ones inert', () => {
  const options = [
    { value: '7d', label: '7d', href: '/admin/traffic?range=7d' },
    { value: '30d', label: '30d', href: '/admin/traffic?range=30d' },
    { value: '90d', label: '90d', href: '/admin/traffic?range=90d', disabled: true },
    { value: 'all', label: 'All' },
  ];
  const html = renderToStaticMarkup(
    createElement(SegmentedControl, { label: 'Reporting range', value: '30d', options }),
  );

  expect(html).toMatch(/^<div role="group" aria-label="Reporting range"/);
  expect(segmentTag(html, 'a', '7d')).toMatch(/^ data-next-link="" data-scroll="false" href="\/admin\/traffic\?range=7d" class="/);
  expect(segmentTag(html, 'a', '30d')).toMatch(
    /^ data-next-link="" data-scroll="false" href="\/admin\/traffic\?range=30d" aria-current="page" class="/,
  );
  expect(segmentClasses(html, 'a', '30d')).toEqual(expect.arrayContaining(ACTIVE_FILL));
  for (const label of ['90d', 'All']) {
    expect(segmentTag(html, 'a', label)).toMatch(/^ role="link" aria-disabled="true" class="/);
    const inert = segmentClasses(html, 'a', label);
    expect(inert).toEqual(expect.arrayContaining(['cursor-not-allowed', 'opacity-40', 'hover:text-muted']));
    expect(inert).not.toContain('hover:text-text');
  }

  const fallback = renderToStaticMarkup(
    createElement(SegmentedControl, { label: 'Reporting range', value: '', options }),
  );
  expect(fallback).not.toContain('aria-current');
  expect(segmentClasses(fallback, 'a', '30d')).not.toContain('bg-row-on');
});
