import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Field } from './field';
import { Select } from './select';

const ITEMS = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
];

test('a Field labels the Select inside it through the trigger id it hands down', () => {
  const props = {
    label: 'Category',
    hint: 'Pick the closest fit',
    children: createElement(Select, { value: 'bug', onValueChange: vi.fn(), items: ITEMS }),
  };
  const html = renderToStaticMarkup(createElement(Field, props));
  const htmlFor = /<label[^>]* for="([^"]+)" class="font-ui text-ui font-medium text-text">Category<\/label>/.exec(html)?.[1];
  const trigger = /<button[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? '';
  const hintId = /<p id="([^"]+)"[^>]*>Pick the closest fit<\/p>/.exec(html)?.[1];
  expect(htmlFor).toBeTruthy();
  expect(trigger).toContain(` id="${htmlFor}"`);
  expect(trigger).toContain(` aria-describedby="${hintId}"`);
  expect(trigger).toContain(' aria-invalid="false"');
  // The visible label is the name; nothing competes with it.
  expect(trigger).not.toContain('aria-label=');
});

test('an eyebrow Field keeps a dense caps label and leaves an undescribed control without aria-describedby', () => {
  const select = () => createElement(Select, { value: 'bug', onValueChange: vi.fn(), items: ITEMS });
  const eyebrow = { label: 'Kind', labelStyle: 'eyebrow', error: 'Pick a kind.', children: select() } as const;
  const html = renderToStaticMarkup(createElement(Field, eyebrow));
  const label = /<label[^>]* for="([^"]+)" class="([^"]+)">Kind<\/label>/.exec(html);
  const trigger = /<button[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? '';
  const errorId = /<div[^>]* id="([^"]+)"[^>]*><svg[^>]*>.*<\/svg>Pick a kind\.<\/div>/.exec(html)?.[1];
  expect(label?.[2]).toContain('uppercase');
  expect(label?.[2]).toContain('text-micro');
  expect(trigger).toContain(` id="${label?.[1]}"`);
  expect(trigger).toContain(` aria-describedby="${errorId}"`);
  expect(trigger).toContain(' aria-invalid="true"');

  const plain = { label: 'Kind', children: select() };
  const undescribed = renderToStaticMarkup(createElement(Field, plain));
  expect(undescribed).toContain('role="combobox"');
  expect(undescribed).not.toContain('aria-describedby');
});
