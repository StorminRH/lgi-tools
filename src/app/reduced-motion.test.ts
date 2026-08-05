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
    expect(css).toContain(`.${className}`);
    // Require animation: none on a rule whose selector includes this class —
    // not merely that some other rule in the same media block disables animation.
    const ruleRe = new RegExp(
      String.raw`@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.${className}\b[^{]*\{[^}]*animation:\s*none`,
    );
    expect(ruleRe.test(css), `.${className} needs an animation: none reduced-motion override`).toBe(
      true,
    );
  });
});
