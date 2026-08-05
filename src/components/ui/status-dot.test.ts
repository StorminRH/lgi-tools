import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StatusDot', () => {
  it('disables the online pulse under reduced motion', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.status-led \{ animation: none; \}/,
    );
  });
});
