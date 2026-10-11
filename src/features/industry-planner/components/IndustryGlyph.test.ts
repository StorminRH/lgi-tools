import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { GemIcon, HourglassIcon } from './MeAdjuster';

test('an owned blueprint’s glyph glows in the efficiency tone while an unowned one stays muted without a glow', () => {
  const owned = renderToStaticMarkup(createElement(GemIcon, { state: 'owned' }));
  expect(owned).toContain('drop-shadow');
  expect(owned).toContain('text-evb-bright');
  expect(owned).not.toContain('text-muted');

  const unowned = renderToStaticMarkup(createElement(HourglassIcon, { state: 'unowned' }));
  expect(unowned).toContain('text-muted');
  expect(unowned).not.toContain('drop-shadow');
});
