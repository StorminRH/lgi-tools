import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `fallow health` treats `--coverage-gaps` as a section flag: without
// `--complexity` beside it, complexity and CRAP findings never reach
// `--fail-on-issues`. That silently turned the gate off once already.
// This suite runs each health command from package.json against a
// fixture with one over-complex function and one untested one.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FALLOW = join(ROOT, 'node_modules', '.bin', 'fallow');
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;

function healthArgs(script) {
  const segment = scripts[script]
    .split('&&')
    .map((part) => part.trim())
    .find((part) => part.startsWith('fallow health '));
  if (!segment) throw new Error(`${script} has no fallow health step`);
  return segment.split(/\s+/).slice(1);
}

const branches = (count) =>
  Array.from({ length: count }, (_, n) => `  if (n === ${n}) return ${n};`).join('\n');

// `tangled` breaches cyclomatic 20; `untested` stays under the complexity
// limits but has zero Istanbul hits, so only CRAP can catch it.
const SOURCE = `export function tangled(n: number): number {
${branches(24)}
  return -1;
}

export function untested(n: number): number {
${branches(10)}
  return -1;
}
`;
const UNTESTED_LINE = SOURCE.split('\n').findIndex((line) => line.includes('untested')) + 1;

function writeCoverageMap(dir, coveragePath) {
  const file = join(dir, 'src', 'index.ts');
  const end = SOURCE.split('\n').length;
  const loc = (start, stop) => ({ start: { line: start, column: 0 }, end: { line: stop, column: 1 } });
  const map = {
    [file]: {
      path: file,
      statementMap: { 0: loc(1, UNTESTED_LINE - 1), 1: loc(UNTESTED_LINE, end) },
      fnMap: {
        0: { name: 'tangled', decl: loc(1, 1), loc: loc(1, UNTESTED_LINE - 1), line: 1 },
        1: { name: 'untested', decl: loc(UNTESTED_LINE, UNTESTED_LINE), loc: loc(UNTESTED_LINE, end), line: UNTESTED_LINE },
      },
      branchMap: {},
      s: { 0: 1, 1: 0 },
      f: { 0: 1, 1: 0 },
      b: {},
    },
  };
  mkdirSync(dirname(join(dir, coveragePath)), { recursive: true });
  writeFileSync(join(dir, coveragePath), JSON.stringify(map));
}

let fixture;

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'fallow-gate-'));
  const config = JSON.parse(readFileSync(join(ROOT, '.fallowrc.json'), 'utf8'));
  writeFileSync(
    join(fixture, '.fallowrc.json'),
    JSON.stringify({ health: config.health, rules: { 'coverage-gaps': 'error' } }),
  );
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'fallow-gate-fixture', private: true, main: 'src/wrap.ts', devDependencies: { vitest: '*' } }),
  );
  mkdirSync(join(fixture, 'src'));
  writeFileSync(join(fixture, 'src', 'index.ts'), SOURCE);
  writeFileSync(
    join(fixture, 'src', 'wrap.ts'),
    "import { tangled, untested } from './index';\n\nexport const run = (n: number): number => tangled(n) + untested(n);\n",
  );
  writeFileSync(join(fixture, 'src', 'wrap.test.ts'), "import { run } from './wrap';\n\nrun(1);\n");
});

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function runHealth(script) {
  const args = healthArgs(script);
  const coverage = args.indexOf('--coverage');
  if (coverage !== -1) writeCoverageMap(fixture, args[coverage + 1]);
  const result = spawnSync(FALLOW, args, { cwd: fixture, encoding: 'utf8', timeout: 30_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('fallow health gates', () => {
  it('fallow:static fails on complexity and leaves CRAP to the coverage gate', () => {
    const { status, output } = runHealth('fallow:static');

    expect(status).toBe(1);
    expect(output).toMatch(/:1 tangled/);
    expect(output).not.toMatch(new RegExp(`:${UNTESTED_LINE} untested`));
  });

  it('fallow:coverage fails on complexity and on CRAP from the coverage map', () => {
    const { status, output } = runHealth('fallow:coverage');

    expect(status).toBe(1);
    expect(output).toMatch(/:1 tangled/);
    expect(output).toMatch(new RegExp(`:${UNTESTED_LINE} untested`));
  });

  it('pnpm fallow runs both gates', () => {
    expect(scripts.fallow).toContain('pnpm fallow:static');
    expect(scripts.fallow).toContain('pnpm fallow:coverage');
  });
});
