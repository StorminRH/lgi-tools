import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { NavRailLayout } from './nav-rail';

type Props = Parameters<typeof NavRailLayout>[0];

function render(props: Props): string {
  return renderToStaticMarkup(createElement(NavRailLayout, props));
}

function classesOf(html: string, tag: RegExp): string[] {
  return tag.exec(html)?.[1]?.split(' ') ?? [];
}

test('the layout seats the rail beside a content column and forwards hooks to both', () => {
  const html = render({
    'data-settings-layout': true,
    columns: 'reading',
    rail: createElement('nav', null, 'Rail'),
    contentProps: { 'data-settings-content': true },
    contentClassName: 'flex flex-col gap-6',
    children: createElement('p', null, 'Body'),
  });

  const grid = classesOf(html, /^<div data-settings-layout="true" class="([^"]*)"><nav>Rail<\/nav>/);
  expect(grid).toEqual(
    expect.arrayContaining([
      'grid',
      'items-start',
      'gap-5',
      'lg:gap-10',
      'lg:grid-cols-[220px_minmax(0,var(--container-reading))]',
    ]),
  );

  const content = classesOf(html, /<\/nav><div data-settings-content="true" class="([^"]*)"><p>Body<\/p><\/div><\/div>$/);
  expect(content).toEqual(expect.arrayContaining(['min-w-0', 'flex', 'flex-col', 'gap-6']));
});

test('a section rail is the default and a caller class lands on the grid', () => {
  const html = render({ className: 'pb-16', rail: 'Rail', children: 'Body' });

  const grid = classesOf(html, /^<div class="([^"]*)">Rail<div class="min-w-0">Body<\/div><\/div>$/);
  expect(grid).toEqual(expect.arrayContaining(['grid', 'lg:grid-cols-[220px_minmax(0,1fr)]', 'pb-16']));

  const chapters = classesOf(render({ columns: 'chapters', rail: 'Rail', children: 'Body' }), /^<div class="([^"]*)">/);
  expect(chapters).toContain('lg:grid-cols-[232px_minmax(0,1fr)]');
  expect(chapters).not.toContain('lg:grid-cols-[220px_minmax(0,1fr)]');
});
