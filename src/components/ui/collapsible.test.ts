import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Collapsible, CollapsibleChevron } from './collapsible';

function render(chevron?: boolean): string {
  return renderToStaticMarkup(
    Collapsible({ header: 'Price cron', chevron, children: createElement('p', null, 'Details') }),
  );
}

test('draws the turning chevron at the end of the summary only when asked, hidden from screen readers', () => {
  expect(render(true)).toMatch(
    /<summary [^>]*>Price cron<span [^>]*><span data-chevron="true" aria-hidden="true" [^>]*>▾<\/span><\/span><\/summary>/,
  );

  const plain = render();
  expect(plain).not.toContain('data-chevron');
  expect(plain).toMatch(/<summary [^>]*>Price cron<\/summary>/);
});

test('lets a custom header place its own chevron or mark, still hidden from screen readers', () => {
  const html = renderToStaticMarkup(
    Collapsible({
      header: createElement('span', null, 'Layout dials', CollapsibleChevron({ className: 'ml-auto' })),
      children: createElement('p', null, 'Details'),
    }),
  );
  expect(html).toMatch(
    /<summary [^>]*><span>Layout dials<span data-chevron="true" aria-hidden="true" [^>]*>▾<\/span><\/span><\/summary>/,
  );

  const icon = renderToStaticMarkup(CollapsibleChevron({ children: createElement('svg') }));
  expect(icon).toMatch(/^<span data-chevron="true" aria-hidden="true" [^>]*><svg><\/svg><\/span>$/);
});
