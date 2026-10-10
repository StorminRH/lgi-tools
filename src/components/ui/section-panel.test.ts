import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SectionPanel } from './section-panel';

type Props = Parameters<typeof SectionPanel>[0];

function render(props: Props): string {
  return renderToStaticMarkup(createElement(SectionPanel, props));
}

function rootClasses(html: string): string[] {
  return /^<section class="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
}

test('a titled panel is a clipped card section under a medium header bar', () => {
  const html = render({
    title: 'Wallet',
    meta: '30 days',
    className: 'reveal reveal-2',
    children: createElement('p', null, 'Body row'),
  });

  expect(rootClasses(html)).toEqual(
    expect.arrayContaining([
      'glass-surface',
      'rounded-card',
      'font-ui',
      'min-w-0',
      'overflow-hidden',
      'reveal',
      'reveal-2',
    ]),
  );
  expect(html).toMatch(/<\/section>$/);

  const bar = /^<section[^>]*><div class="([^"]*)"><span>Wallet<\/span>/.exec(html)?.[1]?.split(' ') ?? [];
  expect(bar).toEqual(expect.arrayContaining(['bg-row-hover', 'border-b', 'py-2', 'uppercase']));
  expect(html).toContain('<span class="text-micro font-normal text-muted">30 days</span></div><p>Body row</p>');
});

test('a panel can join the page outline and carry its anchor and test hook', () => {
  const props = {
    title: 'Scheduled tasks',
    titleAs: 'h3' as const,
    id: 'scheduled',
    'data-admin-card': 'scheduled-tasks',
    children: 'Rows',
  };
  const html = render(props);

  expect(html).toMatch(/^<section class="[^"]*" id="scheduled" data-admin-card="scheduled-tasks">/);
  expect(html).toContain('<h3>Scheduled tasks</h3></div>Rows</section>');
  expect(html).not.toContain('text-micro font-normal text-muted');
});

test('a caller class wins over the panel clip without losing the card glass', () => {
  const root = rootClasses(render({ title: 'Facilities', className: 'overflow-visible', children: 'Rows' }));

  expect(root).toContain('overflow-visible');
  expect(root).not.toContain('overflow-hidden');
  expect(root).toEqual(expect.arrayContaining(['glass-surface', 'rounded-card', 'min-w-0']));
});
