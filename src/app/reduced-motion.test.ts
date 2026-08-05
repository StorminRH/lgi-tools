import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Consolidated a11y gate for globals.css: every looping animation must go
// static under prefers-reduced-motion. One suite instead of per-component CSS
// greps — deleting a class's reduced-motion override (or the whole media
// block) fails here and nowhere else. Mapper motion invariants live in
// src/mapper's motion-contract suite; this list is the non-map loopers.
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
    // The class still exists and animates somewhere…
    expect(css).toContain(`.${className}`);
    // …and some reduced-motion block sets it to animation: none.
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)];
    const covered = blocks.some(
      ([block]) => block.includes(`.${className}`) && block.includes('animation: none'),
    );
    expect(covered, `.${className} needs an animation: none reduced-motion override`).toBe(true);
  });
});
