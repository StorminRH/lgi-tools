import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleChevron } from './collapsible';

function render(chevron?: boolean): string {
  return renderToStaticMarkup(
    Collapsible({ header: 'Price cron', chevron, children: createElement('p', null, 'Details') }),
  );
}

describe('Collapsible', () => {
  it('draws the turning chevron at the end of the summary, hidden from screen readers', () => {
    const html = render(true);
    expect(html).toMatch(
      /<summary [^>]*>Price cron<span class="[^"]*"><span data-chevron="true" aria-hidden="true" class="[^"]*transition-transform[^"]*">▾<\/span><\/span><\/summary>/,
    );
  });

  it('pins the chevron to the first text line of a multi-line header', () => {
    expect(render(true)).toContain('<span class="flex h-lh shrink-0 items-center self-start text-ui"><span data-chevron');
  });

  it('lets a custom header place its own chevron or mark, still hidden from screen readers', () => {
    const html = renderToStaticMarkup(
      Collapsible({
        header: createElement('span', { className: 'flex w-full' }, 'Layout dials', CollapsibleChevron({ className: 'ml-auto' })),
        children: createElement('p', null, 'Details'),
      }),
    );
    expect(html).toMatch(
      /<summary [^>]*><span class="flex w-full">Layout dials<span data-chevron="true" aria-hidden="true" class="inline-block shrink-0 text-micro text-muted transition-transform ml-auto">▾<\/span><\/span><\/summary>/,
    );

    const icon = renderToStaticMarkup(CollapsibleChevron({ className: 'flex', children: createElement('svg') }));
    expect(icon).toBe(
      '<span data-chevron="true" aria-hidden="true" class="shrink-0 text-micro text-muted transition-transform flex"><svg></svg></span>',
    );
  });

  it('leaves the summary to the header without the chevron', () => {
    const html = render();
    expect(html).not.toContain('data-chevron');
    expect(html).toMatch(/<summary [^>]*>Price cron<\/summary>/);
  });
});
