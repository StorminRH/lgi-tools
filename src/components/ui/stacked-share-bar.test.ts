import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SlimShareBar, StackedShareBar, stackedShareLayout } from './stacked-share-bar';

describe('stackedShareLayout', () => {
  it('lays segments end-to-end across the width with cumulative x and share %', () => {
    const parts = stackedShareLayout(
      [
        { label: 'New', value: 30, tone: 'blue' },
        { label: 'Returning', value: 70, tone: 'purple' },
      ],
      200,
    );
    expect(parts[0]).toMatchObject({ x: 0, w: 60, pct: 30, labelX: 0, labelAnchor: 'start' });
    expect(parts[1]).toMatchObject({ x: 60, w: 140, pct: 70, labelX: 200, labelAnchor: 'end' });
  });

  it('returns nothing when the total is zero', () => {
    expect(stackedShareLayout([{ label: 'a', value: 0, tone: 'blue' }], 200)).toEqual([]);
  });
});

describe('StackedShareBar', () => {
  it('names the bar with each segment value, which its SVG labels do not give screen readers', () => {
    const html = renderToStaticMarkup(
      createElement(StackedShareBar, {
        ariaLabel: 'Referred versus unattributed page views',
        segments: [
          { label: 'Referred', value: 3, tone: 'blue' },
          { label: 'Unattributed', value: 1209, tone: 'neutral' },
        ],
      }),
    );
    expect(html).toContain(
      'role="img" aria-label="Referred versus unattributed page views: Referred 3, Unattributed 1,209"',
    );
  });

  it('renders nothing when every share is zero', () => {
    const html = renderToStaticMarkup(
      createElement(StackedShareBar, { ariaLabel: 'Empty', segments: [{ label: 'a', value: 0, tone: 'blue' }] }),
    );
    expect(html).toBe('');
  });
});

describe('SlimShareBar', () => {
  it('draws one segment per share with a gap before each later segment', () => {
    const html = renderToStaticMarkup(
      createElement(SlimShareBar, {
        ariaLabel: 'Sync runs',
        segments: [
          { label: 'synced', value: 23, tone: 'green' },
          { label: 'partial', value: 6, tone: 'orange' },
        ],
      }),
    );
    expect(html).toContain('aria-label="Sync runs"');
    expect(html.match(/<rect/g)).toHaveLength(2);
    expect(html.match(/<line/g)).toHaveLength(1);
  });

  it('renders nothing when every share is zero', () => {
    const html = renderToStaticMarkup(
      createElement(SlimShareBar, {
        ariaLabel: 'Empty',
        segments: [{ label: 'a', value: 0, tone: 'green' }],
      }),
    );
    expect(html).toBe('');
  });
});
