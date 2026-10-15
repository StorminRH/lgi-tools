import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DeltaBadge } from './DeltaBadge';
import { deriveDeltaBadge } from './delta-badge-view';

test('deriveDeltaBadge reads new, flat, change, and inverted-colour badges', () => {
  expect(deriveDeltaBadge({ pct: null, direction: 'up' })).toEqual({
    kind: 'new',
    tone: 'green',
    text: 'new',
    spoken: 'new',
  });
  expect(deriveDeltaBadge({ pct: null, direction: 'flat' })).toEqual({
    kind: 'none',
    tone: 'neutral',
    text: '—',
    spoken: 'no change',
  });
  expect(deriveDeltaBadge({ pct: null, direction: 'down' })).toMatchObject({ kind: 'none' });
  expect(deriveDeltaBadge({ pct: 0, direction: 'flat' })).toEqual({
    kind: 'flat',
    tone: 'neutral',
    text: '±0%',
    spoken: 'no change',
  });
  expect(deriveDeltaBadge({ pct: 12, direction: 'up' })).toEqual({
    kind: 'change',
    tone: 'green',
    text: '▲ 12%',
    spoken: 'up 12%',
  });
  expect(deriveDeltaBadge({ pct: -8, direction: 'down' })).toEqual({
    kind: 'change',
    tone: 'red',
    text: '▼ 8%',
    spoken: 'down 8%',
  });
  expect(deriveDeltaBadge({ pct: -8, direction: 'down' }, true)).toMatchObject({ tone: 'green', text: '▼ 8%' });
  expect(deriveDeltaBadge({ pct: 12, direction: 'up' }, true)).toMatchObject({ tone: 'red', text: '▲ 12%' });
});

test('DeltaBadge hides the arrow from screen readers, says the change in words, and colours it by tone', () => {
  const render = (delta: Parameters<typeof deriveDeltaBadge>[0], invert?: boolean) =>
    renderToStaticMarkup(createElement(DeltaBadge, { delta, invert }));

  expect(render({ pct: 12, direction: 'up' })).toBe(
    '<span class="font-data text-ui tabular-nums text-isk"><span aria-hidden="true">▲ 12%</span><span class="sr-only">up 12%</span></span>',
  );
  expect(render({ pct: -5, direction: 'down' })).toContain('text-tone-red');
  expect(render({ pct: -5, direction: 'down' })).toContain('<span class="sr-only">down 5%</span>');
  expect(render({ pct: -5, direction: 'down' }, true)).toContain('text-isk');
});
