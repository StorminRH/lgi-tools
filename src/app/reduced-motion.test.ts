import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

function allStylesheets(): string {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.css')) files.push(file);
    }
  };
  walk('src');
  return files.sort().map((file) => readFileSync(file, 'utf8')).join('\n');
}

const LOOPING_CLASSES = [
  'skeleton-shimmer',
  'hover-bob',
  'industry-cur',
  'status-led',
  'price-pending',
  'price-flash',
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
