import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

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

// The rules inside each flat `@media (prefers-reduced-motion: reduce)` block.
function reducedMotionRules(css: string): { selectors: string[]; body: string }[] {
  const blocks = css.matchAll(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g,
  );
  return [...blocks].flatMap((block) =>
    [...block[1]!.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({
      selectors: rule[1]!.split(',').map((selector) => selector.trim()),
      body: rule[2]!,
    })),
  );
}

// Every view transition's pseudo-elements hang off the document root, so the
// rule that makes them instant is a document rule and lives in globals.css,
// not in one owner's stylesheet.
test('globals.css makes every view transition instant under reduced motion', () => {
  const css = stripComments(readFileSync('src/app/globals.css', 'utf8'));
  const pseudos = ['group', 'image-pair', 'old', 'new'].map((part) => `::view-transition-${part}(*)`);
  const instant = reducedMotionRules(css).filter((rule) =>
    pseudos.every((pseudo) => rule.selectors.includes(pseudo)),
  );

  expect(instant).toHaveLength(1);
  expect(instant[0]!.body).toMatch(/animation-duration:\s*0s\s*!important/);
  expect(instant[0]!.body).toMatch(/animation-delay:\s*0s\s*!important/);
});
