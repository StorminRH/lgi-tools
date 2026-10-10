import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { listSourceFiles } from '@/lib/__tests__/source-scan';

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
