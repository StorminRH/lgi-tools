#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveLane } from '../e2e/lane-policy.mjs';
import { isLocalBaseUrl, remoteSkipSeedError } from './run-e2e-guard.mjs';

const argv = process.argv.slice(2).filter((arg) => arg !== '--');
try {
  const { baseURL, local } = resolveLane({ argv });
  if (local !== isLocalBaseUrl(baseURL)) {
    throw new Error('BLOCKED prerequisite: lane locality does not match the target URL');
  }
  const error = remoteSkipSeedError({
    baseUrl: baseURL,
    skipSeed: process.env.E2E_SKIP_SEED === '1',
    e2eStorageState: process.env.E2E_STORAGE_STATE,
    uxStorageState: process.env.UX_STORAGE_STATE,
  });
  if (error) throw new Error(error);
} catch {
  mkdirSync('docs/ux-check/captures', { recursive: true });
  writeFileSync('docs/ux-check/captures/e2e-report.json', JSON.stringify({
    status: 'BLOCKED', classification: 'target-or-selection-prerequisite',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    time: new Date().toISOString(), selected: [], skipped: [], blocked: ['run-prerequisite'],
  }, null, 2));
  console.error('BLOCKED: invalid lane, selection or target/auth prerequisite. See docs/ux-check/README.md.');
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...argv], {
  stdio: 'inherit', shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
