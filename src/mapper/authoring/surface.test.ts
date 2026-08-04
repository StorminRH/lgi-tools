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

  it('ships sever/restore affordances without internalized tombstone helpers', () => {
    // OW5: sever is the sole destructive UI entry; restoreConnection is the
    // dying-edge restore. Internalized .1 helpers stay out of the UI layer.
    const sources = authoringFiles().map((file) => sourceOf(file)).join('\n');
    expect(sources).toMatch(/\bSever\b/);
    expect(sources).toContain('data-map-connection-sever');
    expect(sources).toContain('data-map-connection-restore');
    expect(sources).toContain('announceSeverOutcome');
    expect(sources).toContain('severConnection');
    expect(sources).toContain('restoreSeveredBranch');
    expect(sources).toContain('restoreConnection');
    for (const file of authoringFiles()) {
      const source = sourceOf(file);
      expect(source, file).not.toContain('tombstoneSystem');
      expect(source, file).not.toContain('tombstoneConnection');
      expect(source, file).not.toContain('restoreSystem');
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

  it('locks typed codex size and never duplicates codex facts as editors (HC-1)', () => {
    const fields = sourceOf('connection-fields.tsx');
    expect(fields).toContain('data-map-connection-codex');
    expect(fields).toContain('data-map-connection-size-locked');
    expect(fields).toContain('isCodexSizeLocked');
    expect(fields).not.toMatch(/ariaLabel=\{?['"]Total mass/i);
    expect(fields).not.toMatch(/ariaLabel=\{?['"]Per-jump/i);
  });
});
