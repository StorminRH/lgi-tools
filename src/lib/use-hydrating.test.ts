import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { useHydrating } from './use-hydrating';

function Probe() {
  return createElement('span', null, useHydrating() ? 'hydrating' : 'client');
}

test('server renders read as hydrating, matching what a hydrating client reads', () => {
  expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>hydrating</span>');
});
