import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Field } from '@/components/ui/field';
import { PercentInput } from './PercentInput';

const inputOf = (html: string) => /<input[^>]*>/.exec(html)?.[0] ?? '';

test('a Field names the percent input by its visible label and passes its state down', () => {
  const props = {
    label: 'Facility tax',
    labelStyle: 'eyebrow',
    hint: '0–10%',
    children: createElement(PercentInput, { value: '2.5', onChange: vi.fn(), disabled: true }),
  } as const;
  const html = renderToStaticMarkup(createElement(Field, props));
  const htmlFor = /<label[^>]* for="([^"]+)"[^>]*>Facility tax<\/label>/.exec(html)?.[1];
  const hintId = /<p id="([^"]+)"[^>]*>0–10%<\/p>/.exec(html)?.[1];
  const input = inputOf(html);
  expect(htmlFor).toBeTruthy();
  expect(input).toContain(` id="${htmlFor}"`);
  expect(input).toContain(` aria-describedby="${hintId}"`);
  expect(input).toContain(' aria-invalid="false"');
  expect(input).toContain(' disabled=""');
  expect(input).toContain(' value="2.5"');
  expect(input).not.toContain('aria-label=');
  expect(html).toContain('>%</span>');
});

test('outside a Field the percent input is named by its aria label', () => {
  const input = inputOf(
    renderToStaticMarkup(
      createElement(PercentInput, { value: '', onChange: vi.fn(), ariaLabel: 'Manufacturing material bonus' }),
    ),
  );
  expect(input).toContain(' aria-label="Manufacturing material bonus"');
  expect(input).toContain(' inputMode="decimal"');
  expect(input).not.toContain(' id=');
});
