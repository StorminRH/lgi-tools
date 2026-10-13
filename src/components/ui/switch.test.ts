import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Switch } from './switch';

const controlOf = (html: string) => /<span[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? '';
const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];

test('a bare switch is named by its label and keeps its id on the hidden input', () => {
  const html = renderToStaticMarkup(
    createElement(Switch, { checked: true, onCheckedChange: vi.fn(), label: 'Compact rows', id: 'compact' }),
  );
  const track = controlOf(html);
  expect(html).not.toContain('<label');
  expect(attr(track, 'aria-label')).toBe('Compact rows');
  expect(attr(track, 'aria-checked')).toBe('true');
  expect(html).toMatch(/<input id="compact"[^>]*type="checkbox"/);
});

test('a switch row keeps its trailing state text out of the name and dims as one when disabled', () => {
  const row = (disabled: boolean) =>
    renderToStaticMarkup(
      createElement(
        Switch,
        { checked: false, onCheckedChange: vi.fn(), label: 'Signal Cartel', disabled },
        createElement('span', null, 'Signal Cartel'),
        createElement('span', null, 'sharing off'),
      ),
    );
  const html = row(false);
  const track = controlOf(html);
  const nameId = attr(track, 'aria-labelledby');
  expect(html).toMatch(/^<label class="[^"]*cursor-pointer[^"]*has-\[\[data-disabled\]\]:opacity-50[^"]*">/);
  expect(html).toContain(`<span id="${nameId}" hidden="">Signal Cartel</span>`);
  expect(html).toContain('<span>sharing off</span>');
  expect(attr(track, 'aria-label')).toBeUndefined();
  expect(attr(track, 'data-disabled')).toBeUndefined();

  const busy = controlOf(row(true));
  expect(attr(busy, 'data-disabled')).toBe('');
  expect(attr(busy, 'class')).not.toContain('opacity-50');
});
