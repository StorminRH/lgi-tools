import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Collapsible } from './collapsible';

function render(chevron?: boolean): string {
  return renderToStaticMarkup(
    Collapsible({ header: 'Price cron', chevron, children: createElement('p', null, 'Details') }),
  );
}

describe('Collapsible', () => {
  it('draws the turning chevron at the end of the summary, hidden from screen readers', () => {
    const html = render(true);
    expect(html).toMatch(
      /<summary [^>]*>Price cron<span data-chevron="true" aria-hidden="true" class="[^"]*transition-transform[^"]*">▾<\/span><\/summary>/,
    );
  });

  it('leaves the summary to the header without the chevron', () => {
    const html = render();
    expect(html).not.toContain('data-chevron');
    expect(html).toMatch(/<summary [^>]*>Price cron<\/summary>/);
  });
});
