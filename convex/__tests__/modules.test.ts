import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from '@/lib/__tests__/source-scan';
import { modules } from './modules.setup';

function productionModules(): string[] {
  return listSourceFiles({
    roots: ['convex'],
    extensions: ['.ts'],
    skipDirectories: ['_generated', '__tests__', 'node_modules'],
    skipSuffixes: ['.test.ts', '.d.ts'],
  }).map((file) => file.replace(/^convex\//, '../'));
}

describe('convex-test module map', () => {
  it('lists every production convex module plus generated api and server', () => {
    const listed = Object.keys(modules).sort();
    expect(listed).toEqual(
      [
        ...productionModules(),
        '../_generated/api.js',
        '../_generated/server.js',
      ].sort(),
    );
  });

  it('names non-test helpers so Convex deploy skips them', () => {
    const helpers = listSourceFiles({
      roots: ['convex/__tests__'],
      extensions: ['.ts'],
      skipSuffixes: ['.test.ts', '.d.ts'],
    }).map((file) => path.posix.basename(file));
    expect(helpers.length).toBeGreaterThan(0);
    for (const name of helpers) {
      expect((name.match(/\./g) ?? []).length).toBeGreaterThan(1);
    }
  });
});
