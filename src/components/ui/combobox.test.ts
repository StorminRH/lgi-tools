import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Field, Root } from './combobox';

test('a search field turns off autofill, spellcheck, autocorrect and capitalisation without its callers asking', () => {
  const html = renderToStaticMarkup(
    createElement(Root, { items: ['Jita'] }, createElement(Field, { 'aria-label': 'System' })),
  );
  const input = /<input[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? '';
  expect(input).toContain('aria-label="System"');
  expect(input).toMatch(/ autocomplete="off"/i);
  expect(input).toMatch(/ spellcheck="false"/i);
  expect(input).toMatch(/ autocorrect="off"/i);
  expect(input).toMatch(/ autocapitalize="none"/i);
});
