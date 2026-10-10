import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CardLink, ExternalLink } from './text-link';

test('CardLink keeps its label and arrow together on one line in the accent colour', () => {
  const html = renderToStaticMarkup(CardLink({ href: '/admin/queue', children: 'Open queue' }));
  const anchor = /^<a class="([^"]*)" href="\/admin\/queue">Open queue →<\/a>$/.exec(html);
  expect(anchor, html).not.toBeNull();
  expect(anchor![1]!.split(' ')).toEqual(expect.arrayContaining(['whitespace-nowrap', 'text-isk', 'no-underline']));

  const leaving = renderToStaticMarkup(CardLink({ href: '/preview/cards', arrow: '↗', children: 'Site cards' }));
  expect(leaving).toMatch(/href="\/preview\/cards">Site cards ↗<\/a>$/);
});

test('ExternalLink opens a new tab without an opener or referrer and takes the caller styling', () => {
  const styled = renderToStaticMarkup(
    ExternalLink({ href: 'https://evewho.com/corporation/1', className: 'font-bold text-name', children: 'Lo-Gang' }),
  );
  expect(styled).toBe(
    '<a href="https://evewho.com/corporation/1" target="_blank" rel="noopener noreferrer" class="font-bold text-name">Lo-Gang</a>',
  );

  const plain = renderToStaticMarkup(ExternalLink({ href: 'https://neon.com', children: 'Neon' }));
  expect(plain).toBe('<a href="https://neon.com" target="_blank" rel="noopener noreferrer">Neon</a>');
});
