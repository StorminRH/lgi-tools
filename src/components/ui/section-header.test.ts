import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from './section-header';

type Props = Parameters<typeof SectionHeader>[0];

function render(props: Partial<Props> = {}): string {
  return renderToStaticMarkup(createElement(SectionHeader, { label: 'Visitors & users', ...props }));
}

describe('SectionHeader', () => {
  it('keeps the label a plain span by default', () => {
    expect(render()).toContain('<span>Visitors &amp; users</span>');
  });

  it('renders the label as a real heading when asked', () => {
    expect(render({ as: 'h2' })).toContain('<h2>Visitors &amp; users</h2>');
    expect(render({ variant: 'sub', as: 'h3' })).toContain('<h3>Visitors &amp; users</h3>');
  });

  it('draws the card header bar as an uppercase eyebrow on the row tint', () => {
    const html = render({ hint: '12 items' });
    expect(html).toMatch(/^<div class="[^"]*\buppercase\b[^"]*\bbg-row-hover\b[^"]*">/);
    expect(html).toContain('py-[5px]');
    expect(render({ size: 'md' })).toContain('py-2');
    expect(html).toContain('<span class="text-micro font-normal text-muted">12 items</span>');
  });

  it('sets a sub-heading in sentence case body text so it reads under the card header', () => {
    const html = render({ variant: 'sub' });
    const classes = /^<div class="([^"]*)"/.exec(html)![1]!.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['font-ui', 'text-ui', 'font-medium', 'text-text']));
    for (const barOnly of ['uppercase', 'bg-row-hover', 'border-b', 'px-3.5', 'tracking-eyebrow']) {
      expect(classes).not.toContain(barOnly);
    }
  });
});
