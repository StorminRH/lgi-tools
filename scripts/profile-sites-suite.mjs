// Counterbalanced six-run `/sites` development profile suite.
//
// Run: pnpm --silent profile:sites-suite
//
// Each run starts from a clean `.next`, invokes the existing bounded profiler,
// and records either normal or explicitly sampled mode. Stdout is exactly one
// suite JSON document; profiler diagnostics remain on stderr. The same suite
// document is written under docs/ux-check/profiles/.

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summariseProfileSuite } from './profile-parse.mjs';

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, 'docs/ux-check/profiles');
const PROFILER = path.join(ROOT, 'scripts/profile-sites-dev.mjs');
const RUN_ORDER = Object.freeze([
  { label: 'after-1', sampleEnv: false },
  { label: 'sample-1', sampleEnv: true },
  { label: 'sample-2', sampleEnv: true },
  { label: 'after-2', sampleEnv: false },
  { label: 'after-3', sampleEnv: false },
  { label: 'sample-3', sampleEnv: true },
]);

let activeChild = null;
let interruptedBy = null;

const diagnostic = (message) => process.stderr.write(`${message}\n`);

function timestampSlug(iso) {
  return iso.replace(/[-:.]/g, '');
}

function runProfiler({ label, sampleEnv }) {
  return new Promise((resolve, reject) => {
    diagnostic(`[suite] starting ${label} (${sampleEnv ? 'sample' : 'normal'})`);
    const env = {
      ...process.env,
      LGI_SITES_SAMPLE: sampleEnv ? '1' : '0',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    };
    const child = spawn(process.execPath, [PROFILER, '--label', label], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    activeChild = child;
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      activeChild = null;
      try {
        resolve({
          result: JSON.parse(stdout),
          processExitCode: exitCode,
          processSignal: signal,
        });
      } catch (error) {
        reject(new Error(
          `${label} emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        ));
      }
    });
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

async function runProfilerSafely(run) {
  try {
    const completed = await runProfiler(run);
    const suiteError = completed.processExitCode === 0
      ? null
      : `${run.label} exited ${completed.processExitCode ?? completed.processSignal}`;
    return {
      runResult: {
        ...completed.result,
        suiteProcessExitCode: completed.processExitCode,
        suiteProcessSignal: completed.processSignal,
      },
      suiteError,
    };
  } catch (error) {
    const reason = errorMessage(error);
    return {
      runResult: {
        label: run.label,
        sampleEnv: run.sampleEnv,
        status: 'failed',
        modeCheck: 'fail',
        suiteProcessExitCode: null,
        suiteProcessSignal: null,
        reason,
      },
      suiteError: reason,
    };
  }
}

function* profileRunsUntilInterrupted() {
  for (const run of RUN_ORDER) {
    if (interruptedBy) return;
    yield run;
  }
}

async function collectProfileRuns() {
  const runs = [];

  for (const run of profileRunsUntilInterrupted()) {
    diagnostic(`[suite] clearing .next before ${run.label}`);
    await rm(path.join(ROOT, '.next'), { recursive: true, force: true });
    const outcome = await runProfilerSafely(run);
    runs.push(outcome.runResult);
    if (outcome.suiteError) return { runs, suiteError: outcome.suiteError };
  }

  return {
    runs,
    suiteError: interruptedBy ? `suite interrupted by ${interruptedBy}` : null,
  };
}

function assembleSuite({ startedAt, finishedAt, outputFile, runs, suiteError }) {
  const summary = summariseProfileSuite(runs);
  const status = summary.gates.passed && suiteError === null ? 'ok' : 'failed';
  return {
    schemaVersion: 1,
    status,
    exitCode: status === 'ok' ? 0 : 1,
    reason: suiteError,
    startedAt,
    finishedAt,
    outputFile: path.relative(ROOT, outputFile),
    runOrder: RUN_ORDER,
    runs,
    summary,
  };
}

async function persistSuite(suite, outputFile) {
  try {
    await mkdir(PROFILE_DIR, { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(suite, null, 2)}\n`, 'utf8');
    return suite;
  } catch (error) {
    return {
      ...suite,
      status: 'failed',
      exitCode: 1,
      reason: `suite output write failed: ${errorMessage(error)}`,
    };
  }
}

async function runSuite() {
  const startedAt = new Date().toISOString();
  const { runs, suiteError } = await collectProfileRuns();
  const finishedAt = new Date().toISOString();
  const outputFile = path.join(PROFILE_DIR, `sites-suite-${timestampSlug(finishedAt)}.json`);
  const suite = await persistSuite(
    assembleSuite({ startedAt, finishedAt, outputFile, runs, suiteError }),
    outputFile,
  );

  process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
  process.exitCode = suite.exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    interruptedBy ??= signal;
    activeChild?.kill(signal);
  });
}

try {
  await runSuite();
} catch (error) {
  const suite = {
    schemaVersion: 1,
    status: 'failed',
    exitCode: 1,
    reason: errorMessage(error),
    startedAt: null,
    finishedAt: new Date().toISOString(),
    runOrder: RUN_ORDER,
    runs: [],
    summary: summariseProfileSuite([]),
  };
  process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
  process.exitCode = 1;
}
