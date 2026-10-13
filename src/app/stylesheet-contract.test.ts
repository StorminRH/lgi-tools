import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { filesMatching, listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

test('globals.css imports each owner stylesheet once', () => {
  const root = 'src/app';
  const entry = `${root}/globals.css`;
  const stylesheets = listSourceFiles({
    roots: ['src'],
    extensions: ['.css'],
    skipSuffixes: ['.module.css'],
  }).filter((file) => file !== entry);
  const imports = [...readFileSync(entry, 'utf8').matchAll(/@import\s+["'](\.[^"']+\.css)["']/g)]
    .map((match) => path.join(root, match[1]!));

  expect(imports.sort()).toEqual(stylesheets.sort());
  for (const file of stylesheets) {
    const owner = file.slice(0, -'.css'.length);
    expect(existsSync(`${owner}.ts`) || existsSync(`${owner}.tsx`), file).toBe(true);
  }
});

// A backdrop-filter that writes the saturation or the 14px chip blur as a
// literal skips the :root --glass-* knobs, so retuning them leaves it behind.
const LITERAL_GLASS_KNOB = /backdrop-filter\s*:[^;}]*(?:saturate\(\s*[\d.]|blur\(\s*14px\s*\))/;

test('backdrop-filters outside globals.css take saturation and chip blur from the glass knobs', () => {
  const planted = new Map([
    ['literal-saturate.css', '.a { backdrop-filter: blur(24px) saturate(1.3); }'],
    ['literal-chip-blur.css', '.a {\n  -webkit-backdrop-filter:\n    blur(14px) saturate(var(--glass-saturate));\n}'],
    [
      'knobs.css',
      '.a { backdrop-filter: blur(var(--glass-chip-blur)) saturate(var(--glass-saturate)); filter: blur(14px) saturate(2); }',
    ],
  ]);
  expect(filesMatching([...planted.keys()], LITERAL_GLASS_KNOB, (file) => planted.get(file)!)).toEqual([
    'literal-saturate.css',
    'literal-chip-blur.css',
  ]);

  const stylesheets = listSourceFiles({ roots: ['src'], extensions: ['.css'] }).filter(
    (file) => file !== 'src/app/globals.css',
  );
  const readStylesheet = (file: string) => stripComments(readFileSync(file, 'utf8'));
  expect(filesMatching(stylesheets, LITERAL_GLASS_KNOB, readStylesheet)).toEqual([]);
});
