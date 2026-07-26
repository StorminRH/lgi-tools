import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scrollArea } from './scroll-area';

describe('scrollArea', () => {
  it('binds bounded overflow regions to the visible native-scrollbar contract', () => {
    expect(scrollArea).toBe('scroll-area');

    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('.scroll-area {');
    expect(css).toContain('scrollbar-gutter: stable');
    expect(css).toContain('@supports not selector(::-webkit-scrollbar)');
    expect(css).toContain('scrollbar-color: var(--color-scroll-thumb)');
    expect(css).toContain('.scroll-area::-webkit-scrollbar-thumb');
  });
});
