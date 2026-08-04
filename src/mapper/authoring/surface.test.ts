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

  it('ships no destructive connection affordance or tombstone UI caller', () => {
    // SC-5.1: tombstone/restore/delete mutations have zero UI callers this session.
    for (const file of authoringFiles()) {
      const source = sourceOf(file);
      expect(source, file).not.toContain('tombstoneSystem');
      expect(source, file).not.toContain('tombstoneConnection');
      expect(source, file).not.toContain('restoreSystem');
      expect(source, file).not.toContain('restoreConnection');
      expect(source, file).not.toMatch(/\bsever\b/i);
      expect(source, file).not.toContain('useMutation');
    }
  });

  it('keeps the tracking home option visible but disabled', () => {
    const home = sourceOf('HomePrompt.tsx');
    expect(home).toContain('data-map-home-current-disabled');
    expect(home).toContain('disabled');
    expect(home).toContain('Requires live tracking');
  });

  it('wires unset stability into the connection fields form', () => {
    const fields = sourceOf('connection-fields.tsx');
    expect(fields).toContain("label: 'Unset'");
    expect(fields).toContain('massState');
    expect(fields).toContain('lifeStage');
    expect(fields).toContain('shipSize');
    expect(fields).toContain('wormholeType');
  });
});
