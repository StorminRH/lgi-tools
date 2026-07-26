import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  it('renders caller-owned display copy while keeping the copied value private to the control', () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, {
        value: 'Tritanium 42',
        displayValue: '1 item',
        feedbackLabel: '1 item',
      }),
    );
    expect(html).toContain('1 item');
    expect(html).not.toContain('Tritanium 42');
    expect(html).toContain('Copy');
  });

  it('supports a disabled empty export without a second button implementation', () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, {
        value: '',
        displayValue: '0 items',
        disabled: true,
      }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('0 items');
  });
});
