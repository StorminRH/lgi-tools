import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { listSourceFiles } from '@/lib/__tests__/source-scan';

function allStylesheets(): string {
  return listSourceFiles({ roots: ['src'], extensions: ['.css'] })
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

const LOOPING_CLASSES = [
  'skeleton-shimmer',
  'edge-glow',
  'live-ping',
  'reveal',
  'home-orbit',
  'hero-bracket',
  'status-led',
  'price-pending',
  'price-flash',
  'map-signature-updated',
] as const;

test('looping classes render statically under reduced motion', () => {
  const css = allStylesheets();

  for (const className of LOOPING_CLASSES) {
    expect(css, className).toContain(`.${className}`);
    const ruleRe = new RegExp(
      String.raw`@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.${className}\b[^{]*\{[^}]*animation:\s*none`,
    );
    expect(
      ruleRe.test(css),
      `.${className} needs an animation: none reduced-motion override`,
    ).toBe(true);
  }
});
