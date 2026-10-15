import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Dot } from './dot';

test('is decorative on its own and reads its label as screen-reader text beside the hidden dot', () => {
  expect(renderToStaticMarkup(createElement(Dot, { tone: 'green' }))).toMatch(
    /^<span aria-hidden="true" class="[^"]*"><\/span>$/,
  );
  expect(renderToStaticMarkup(createElement(Dot, { tone: 'red', label: 'Failing' }))).toMatch(
    /^<span aria-hidden="true" class="[^"]*"><\/span><span class="sr-only">Failing<\/span>$/,
  );
});
