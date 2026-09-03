import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOOPING_CLASSES = [
  'skeleton-shimmer',
  'hover-bob',
  'industry-cur',
  'status-led',
  'price-pending',
  'price-flash',
] as const;

describe('reduced-motion coverage', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');

  it.each(LOOPING_CLASSES)('statically renders .%s under reduced motion', (className) => {
    expect(css).toContain(`.${className}`);

    const ruleRe = new RegExp(
      String.raw`@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.${className}\b[^{]*\{[^}]*animation:\s*none`,
    );
    expect(ruleRe.test(css), `.${className} needs an animation: none reduced-motion override`).toBe(
      true,
    );
  });
});
