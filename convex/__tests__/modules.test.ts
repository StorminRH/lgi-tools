import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modules } from './modules.setup';

const SKIPPED_DIRECTORIES = new Set(['_generated', '__tests__', 'node_modules']);

function productionModules(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      if (entry.name.includes('.test.')) continue;
      found.push(path.replaceAll('\\', '/').replace(/^convex\//, '../'));
    }
  };
  walk(directory);
  return found.sort();
}

describe('convex-test module map', () => {
  it('lists every production convex module plus generated api and server', () => {
    const listed = Object.keys(modules).sort();
    expect(listed).toEqual(
      [
        ...productionModules('convex'),
        '../_generated/api.js',
        '../_generated/server.js',
      ].sort(),
    );
  });

  it('names non-test helpers so Convex deploy skips them', () => {
    const helpers: string[] = [];
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = `${current}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (
          !entry.name.endsWith('.ts') ||
          entry.name.includes('.test.') ||
          entry.name.endsWith('.d.ts')
        ) {
          continue;
        }
        helpers.push(entry.name);
      }
    };
    walk('convex/__tests__');
    expect(helpers.length).toBeGreaterThan(0);
    for (const name of helpers) {
      expect((name.match(/\./g) ?? []).length).toBeGreaterThan(1);
    }
  });
});
