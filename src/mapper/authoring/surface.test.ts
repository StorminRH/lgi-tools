import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

function authoringFiles(): string[] {
  return listSourceFiles({
    roots: ['src/mapper/authoring'],
    extensions: ['.ts', '.tsx'],
    skipSuffixes: ['.test.ts', '.test.tsx'],
  });
}

function sourceOf(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

describe('authoring surface inspection', () => {
  it('owns only the home prompt and node-bound add flow as system creators', () => {
    const sources = authoringFiles().map((file) => sourceOf(file)).join('\n');
    expect(sources).toContain('data-map-home-prompt');
    expect(sources).toContain('Add connection');
    expect(sources).not.toMatch(/['"`]Add system/i);
    expect(sources).not.toContain('addSystem(');
  });
});
