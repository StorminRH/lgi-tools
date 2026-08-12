import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'viewer', label: 'Read-only' },
  { value: 'editor', label: 'Write' },
] as const;

describe('RadioGroup', () => {
  it('stays controlled with no selection when value is null', () => {
    const markup = renderToStaticMarkup(
      createElement(RadioGroup, {
        label: 'Access',
        options: OPTIONS,
        value: null,
        onValueChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Read-only');
    expect(markup).toContain('Write');
    expect(markup).not.toContain('data-checked');
  });

  it('marks the matching option when a value is selected', () => {
    const markup = renderToStaticMarkup(
      createElement(RadioGroup, {
        label: 'Access',
        options: OPTIONS,
        value: 'editor',
        onValueChange: vi.fn(),
      }),
    );

    expect(markup).toContain('data-checked');
  });
});
