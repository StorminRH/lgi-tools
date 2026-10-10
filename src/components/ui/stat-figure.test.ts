import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { StatFigure } from './stat-figure';

type Props = Parameters<typeof StatFigure>[0];

function figure(props: Props): string {
  return renderToStaticMarkup(createElement('dl', null, createElement(StatFigure, props)));
}

/** The class list of the element that directly wraps `text`. */
function classesAround(html: string, tag: string, text: string): string[] {
  const match = new RegExp(`<${tag} class="([^"]*)">${text}<`).exec(html);
  expect(match, html).not.toBeNull();
  return match![1]!.split(' ');
}

test('StatFigure marks a label over a name-coloured figure as one term and description', () => {
  const html = figure({ label: 'Active', children: 3 });
  expect(html).toMatch(/^<dl><div class="flex min-w-0 flex-col gap-0\.5"><dt class="[^"]*">Active<\/dt><dd class="[^"]*">3<\/dd><\/div><\/dl>$/);
  expect(classesAround(html, 'dt', 'Active')).toEqual(expect.arrayContaining(['font-ui', 'uppercase', 'text-micro', 'text-muted']));
  const value = classesAround(html, 'dd', '3');
  expect(value).toEqual(expect.arrayContaining(['font-data', 'text-h3', 'tabular-nums', 'text-name']));
  expect(value).not.toContain('sm:text-stat');
});

test('StatFigure takes a tone, the larger tile size, a note and wider spacing', () => {
  const html = figure({
    label: 'Skill points',
    tone: 'text-isk',
    size: 'lg',
    note: '+1.2M free',
    noteTone: 'text-isk',
    className: 'gap-1 px-3',
    children: '42M',
  });
  const wrapper = /^<dl><div class="([^"]*)">/.exec(html)![1]!.split(' ');
  expect(wrapper).toEqual(expect.arrayContaining(['min-w-0', 'gap-1', 'px-3']));
  expect(wrapper).not.toContain('gap-0.5');
  const value = classesAround(html, 'dd', '42M');
  expect(value).toEqual(expect.arrayContaining(['text-h3', 'sm:text-stat', 'text-isk']));
  expect(value).not.toContain('text-name');
  expect(html).toContain('<dd class="font-data text-micro text-isk">+1.2M free</dd></div>');

  const quiet = figure({ label: 'Skills', size: 'lg', note: '12 at V', children: '300' });
  expect(quiet).toContain('<dd class="font-data text-micro text-muted">12 at V</dd></div>');
});
