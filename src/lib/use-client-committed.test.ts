import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { useClientCommitted } from './use-client-committed';

function Probe() {
  return createElement('span', null, useClientCommitted() ? 'released' : 'held');
}

test('the server snapshot stays held so hydration matches the loading shell', () => {
  expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>held</span>');
});
