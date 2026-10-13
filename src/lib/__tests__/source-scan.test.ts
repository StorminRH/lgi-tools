import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  filesMatching,
  listRouteFiles,
  listSourceFiles,
  resolveLocalImport,
  stripComments,
  valueImportSpecifiers,
} from './source-scan';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});

function fixtureTree(files: Readonly<Record<string, string>>) {
  const root = mkdtempSync(path.join(tmpdir(), 'source-scan-'));
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  }
  return {
    root,
    [Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('listSourceFiles lists every root, filters by extension and suffix, and sorts POSIX paths', () => {
  using tree = fixtureTree({
    'src/b.ts': '',
    'src/a.tsx': '',
    'src/a.test.ts': '',
    'src/a.d.ts': '',
    'src/styles.css': '',
    'src/nested/deep/d.ts': '',
    'src/nested/c.ts': '',
    'src/__tests__/helper.ts': '',
    'convex/e.ts': '',
  });
  const readDirectory = vi.mocked(readdirSync);
  readDirectory.mockClear();

  const files = listSourceFiles({
    roots: [`${tree.root}/src`, `${tree.root}/convex`],
    extensions: ['.ts', '.tsx'],
    skipDirectories: ['__tests__'],
    skipSuffixes: ['.test.ts', '.d.ts'],
  });

  expect(files).toEqual([
    `${tree.root}/convex/e.ts`,
    `${tree.root}/src/a.tsx`,
    `${tree.root}/src/b.ts`,
    `${tree.root}/src/nested/c.ts`,
    `${tree.root}/src/nested/deep/d.ts`,
  ]);
  const readDirectories = readDirectory.mock.calls.map(([directory]) => String(directory));
  expect(readDirectories).toContain(path.join(tree.root, 'src/nested/deep'));
  expect(readDirectories).not.toContain(path.join(tree.root, 'src/__tests__'));
  expect(listSourceFiles({ roots: [`${tree.root}/src`], extensions: ['.css'] })).toEqual([
    `${tree.root}/src/styles.css`,
  ]);
});

test('listRouteFiles finds route handlers of every module kind and nothing route-shaped', () => {
  using tree = fixtureTree({
    'route.ts': '',
    'sites/route.ts': '',
    'sites/[id]/route.mts': '',
    'sites/route-helpers.ts': '',
    'maps/lifecycle-route.ts': '',
    'legacy/route.js': '',
    'legacy/route.test.ts': '',
  });

  expect(listRouteFiles(tree.root)).toEqual([
    `${tree.root}/legacy/route.js`,
    `${tree.root}/route.ts`,
    `${tree.root}/sites/[id]/route.mts`,
    `${tree.root}/sites/route.ts`,
  ]);
});

test('filesMatching matches each file from its start, even with a global pattern', () => {
  const sources: Record<string, string> = {
    'late.ts': 'const result = await fetch(url);',
    'early.ts': 'fetch(url);',
    'none.ts': 'const result = url;',
  };
  const pattern = /fetch\(/g;

  expect(
    filesMatching(['late.ts', 'early.ts', 'none.ts'], pattern, (file) => sources[file] ?? ''),
  ).toEqual(['late.ts', 'early.ts']);

  using tree = fixtureTree({ 'a.ts': 'fetch(a);', 'b.ts': 'b();' });
  expect(
    filesMatching(listSourceFiles({ roots: [tree.root], extensions: ['.ts'] }), pattern),
  ).toEqual([`${tree.root}/a.ts`]);
});

test('stripComments drops block and whole-line comments but keeps code and URLs', () => {
  const source = [
    "const url = 'https://example.test/path'; // trailing note",
    '/* block <button> */ const a = 1;',
    '  // whole-line <details>',
    'const b = 2;',
  ].join('\n');

  expect(stripComments(source)).toBe(
    [
      "const url = 'https://example.test/path'; // trailing note",
      ' const a = 1;',
      '',
      'const b = 2;',
    ].join('\n'),
  );
});

test('valueImportSpecifiers keeps runtime edges and skips type-only clauses', () => {
  const source = [
    "import { type A } from './type-named';",
    "import {\n  type B,\n  type C,\n} from './type-multiline';",
    "export type { D } from './type-reexport';",
    "import type E from './type-default';",
    "import { type F, G } from './mixed';",
    "import H from './default';",
    "export * from './star';",
    "export { I } from './named-reexport';",
    "import './side-effect.css';",
    "const load = () => import('./dynamic');",
  ].join('\n');

  expect(valueImportSpecifiers(source)).toEqual([
    './mixed',
    './default',
    './star',
    './named-reexport',
    './side-effect.css',
    './dynamic',
  ]);
});

test('valueImportSpecifiers reads each clause from its own statement only', () => {
  expect(valueImportSpecifiers("export type { A };\nimport { B } from './b';")).toEqual(['./b']);
  expect(
    valueImportSpecifiers(
      "export type A = { x: number };\nexport function f() {}\nexport { B } from './b';",
    ),
  ).toEqual(['./b']);
  expect(
    valueImportSpecifiers("export function noop() {}\nexport type { C } from './c';"),
  ).toEqual([]);
  expect(valueImportSpecifiers("export type { D }\nimport { E } from './e';")).toEqual(['./e']);
});

test('valueImportSpecifiers reads a statement that follows another on the same line', () => {
  expect(
    valueImportSpecifiers("export type Props = {}; export { SitesTable } from './sites-table';"),
  ).toEqual(['./sites-table']);
  expect(valueImportSpecifiers("const n = 1; import { A } from './a'; import './b.css';")).toEqual([
    './a',
    './b.css',
  ]);
  expect(
    valueImportSpecifiers("export type { C } from './c'; export type D = {}; import type E from './e';"),
  ).toEqual([]);
});

test('resolveLocalImport resolves alias and relative specifiers to the first existing candidate', () => {
  const files = new Set([
    'src/lib/format.ts',
    'src/features/sites/widget.tsx',
    'src/features/sites/components/index.tsx',
    'src/features/sites/card.module.css',
  ]);
  const exists = (file: string) => files.has(file);
  const from = 'src/features/sites/widget.tsx';

  expect(resolveLocalImport(from, '@/lib/format', exists)).toBe('src/lib/format.ts');
  expect(resolveLocalImport(from, './components', exists)).toBe(
    'src/features/sites/components/index.tsx',
  );
  expect(resolveLocalImport(from, '../sites/./card.module.css', exists)).toBe(
    'src/features/sites/card.module.css',
  );
  expect(resolveLocalImport('src/lib/format.ts', '../features/sites/widget', exists)).toBe(
    'src/features/sites/widget.tsx',
  );
  expect(resolveLocalImport(from, './missing', exists)).toBeNull();
  expect(resolveLocalImport(from, 'react', exists)).toBeNull();
});
