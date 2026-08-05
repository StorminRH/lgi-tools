import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = 'src/mapper/authoring';

function authoringFiles(): string[] {
  return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => name.replaceAll('\\', '/'));
}

function sourceOf(relative: string): string {
  return readFileSync(`${ROOT}/${relative}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('authoring surface inspection', () => {
  it('owns only the home prompt and node-bound add flow as system creators', () => {
    // SC-2.3: no global "add system" control outside those two surfaces.
    const sources = authoringFiles().map((file) => sourceOf(file)).join('\n');
    expect(sources).toContain('data-map-home-prompt');
    expect(sources).toContain('Add connection');
    expect(sources).not.toMatch(/['"`]Add system/i);
    expect(sources).not.toContain('addSystem(');
  });
});
