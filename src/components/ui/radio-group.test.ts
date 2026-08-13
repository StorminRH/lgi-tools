import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'viewer', label: 'Read-only' },
  { value: 'editor', label: 'Write' },
] as const;

it('stays controlled with no selection until a matching value is chosen', () => {
  const empty = renderToStaticMarkup(
    createElement(RadioGroup, {
      label: 'Access',
      options: OPTIONS,
      value: null,
      onValueChange: vi.fn(),
    }),
  );
  expect(empty).toContain('Read-only');
  expect(empty).toContain('Write');
  expect(empty).not.toContain('data-checked');

  const selected = renderToStaticMarkup(
    createElement(RadioGroup, {
      label: 'Access',
      options: OPTIONS,
      value: 'editor',
      onValueChange: vi.fn(),
    }),
  );
  expect(selected).toContain('data-checked');
});
