import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROBE_FILE = path.resolve('src/features/feedback/constants.ts');
const PROBE_IMPORT = "\nimport '@/mapper';\n";

function runBoundaryCheck(): { ok: boolean; output: string } {
  try {
    const stdout = execFileSync('npx', ['fallow', 'dead-code', '--boundary-violations'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: stdout };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
    };
  }
}

describe('mapper boundary — features must not import mapper', () => {
  it('reports a reachable features → mapper violation and restores the module', () => {
    const original = readFileSync(PROBE_FILE, 'utf8');
    try {
      writeFileSync(PROBE_FILE, `${original}${PROBE_IMPORT}`);
      const violated = runBoundaryCheck();
      expect(violated.ok).toBe(false);
      expect(violated.output).toMatch(/Boundary violations \(1\)/);
      expect(violated.output).toMatch(/features\/feedback/);
      expect(violated.output).toMatch(/mapper/);
    } finally {
      writeFileSync(PROBE_FILE, original);
    }

    const restored = readFileSync(PROBE_FILE, 'utf8');
    expect(restored).toBe(original);

    const clean = runBoundaryCheck();
    // Fallow prints the success banner on a TTY stderr stream; under pipe capture
    // a clean run is exit 0 with empty stdout.
    expect(clean.ok).toBe(true);
  }, 120_000);
});
