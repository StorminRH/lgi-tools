import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Checkbox } from './checkbox';

const controlOf = (html: string) => /<span[^>]*role="checkbox"[^>]*>/.exec(html)?.[0] ?? '';
const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];

test('a bare checkbox is named by its label and dims itself when disabled', () => {
  const html = renderToStaticMarkup(
    createElement(Checkbox, { checked: true, onCheckedChange: vi.fn(), label: 'Remove Alpha', disabled: true }),
  );
  const box = controlOf(html);
  expect(html).not.toContain('<label');
  expect(attr(box, 'aria-label')).toBe('Remove Alpha');
  expect(attr(box, 'aria-labelledby')).toBeUndefined();
  expect(attr(box, 'data-disabled')).toBe('');
  expect(attr(box, 'class')).toContain('data-disabled:opacity-50');
  expect(attr(box, 'class')).toContain('data-disabled:cursor-not-allowed');
});

test('children draw a clickable label row whose own text names the checkbox', () => {
  const props = {
    checked: false,
    onCheckedChange: vi.fn(),
    tone: 'red',
    className: 'mt-0.5',
    rowClassName: 'items-start',
    children: 'I understand my data will be lost.',
  } as const;
  const html = renderToStaticMarkup(createElement(Checkbox, props));
  const row = /^<label id="([^"]+)" class="([^"]+)">/.exec(html);
  const box = controlOf(html);
  expect(row).not.toBeNull();
  // The row names the control: no aria-label for the visible sentence to disagree with.
  expect(attr(box, 'aria-labelledby')).toBe(row?.[1]);
  expect(attr(box, 'aria-label')).toBeUndefined();
  expect(html).toMatch(/>I understand my data will be lost\.<\/label>$/);
  expect(row?.[2]).toContain('cursor-pointer');
  expect(row?.[2]).toContain('items-start');
  expect(row?.[2]).not.toContain('items-center');
  expect(attr(box, 'class')).toContain('mt-0.5');
});

test('a label beside children names the checkbox in place of the row text, and a disabled row dims as one', () => {
  const html = renderToStaticMarkup(
    createElement(
      Checkbox,
      { checked: true, onCheckedChange: vi.fn(), label: 'Tier 2', disabled: true },
      createElement('span', null, 'Tier 2'),
      createElement('span', null, '· 3 types'),
    ),
  );
  const box = controlOf(html);
  const nameId = attr(box, 'aria-labelledby');
  const rowClass = /^<label class="([^"]+)">/.exec(html)?.[1];
  expect(nameId).toBeTruthy();
  expect(html).toContain(`<span id="${nameId}" hidden="">Tier 2</span>`);
  expect(html).toContain('<span>· 3 types</span>');
  expect(attr(box, 'aria-label')).toBeUndefined();
  // Like a RadioGroup option, the row dims and blocks the cursor; the box does not dim twice.
  expect(attr(box, 'data-disabled')).toBe('');
  expect(rowClass).toContain('has-[[data-disabled]]:opacity-50');
  expect(rowClass).toContain('has-[[data-disabled]]:cursor-not-allowed');
  expect(attr(box, 'class')).not.toContain('opacity-50');
  expect(attr(box, 'class')).toContain('data-disabled:cursor-not-allowed');
});
