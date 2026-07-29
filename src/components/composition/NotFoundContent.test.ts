import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotFoundContent } from './NotFoundContent';

describe('NotFoundContent', () => {
  it('preserves the existing 404 copy without adding a header landmark', () => {
    const markup = renderToStaticMarkup(createElement(NotFoundContent));

    expect(markup).toContain('Nothing on D-Scan');
    expect(markup).toContain('Warp to home');
    expect(markup).not.toContain('<header');
  });
});
