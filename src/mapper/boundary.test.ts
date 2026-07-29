import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PROBE_PATH = 'src/features/wormhole-sites/widget.tsx';
const PROBE_IMPORT = "\nimport '@/mapper';\n";

function runBoundaryCheck(): string {
  const result = spawnSync(
    'npx',
    ['fallow', 'dead-code', '--boundary-violations'],
    { encoding: 'utf8' },
  );
  return `${result.stdout}${result.stderr}`;
}

describe('mapper boundary', () => {
  it('rejects a reachable feature-to-mapper import and restores the probe bytes', () => {
    const before = readFileSync(PROBE_PATH, 'utf8');
    let violation = '';

    try {
      writeFileSync(PROBE_PATH, `${before}${PROBE_IMPORT}`, 'utf8');
      violation = runBoundaryCheck();
    } finally {
      writeFileSync(PROBE_PATH, before, 'utf8');
    }

    expect(violation).toMatch(/Boundary violations \(1\)/);
    expect(violation).toMatch(/features\/wormhole-sites\s+→\s+mapper/);
    expect(runBoundaryCheck()).toContain('✓ No issues found');
    expect(readFileSync(PROBE_PATH, 'utf8')).toBe(before);
  });
});
