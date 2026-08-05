#!/usr/bin/env node
// Runs Playwright E2E after seeding local Better Auth storage state.
// Set E2E_SKIP_SEED=1 when storage state already exists, or when pointing at a
// remote base URL with an operator-exported file via E2E_STORAGE_STATE (or
// UX_STORAGE_STATE). Cookie jars are for pnpm ux-check / run-probes — not this
// runner; Playwright specs consume storageState JSON only.
import { spawnSync } from 'node:child_process';
import { remoteSkipSeedError } from './run-e2e-guard.mjs';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.UX_BASE_URL ?? 'http://localhost:3000';
const skipSeed = process.env.E2E_SKIP_SEED === '1';
const guardError = remoteSkipSeedError({
  baseUrl,
  skipSeed,
  e2eStorageState: process.env.E2E_STORAGE_STATE,
  uxStorageState: process.env.UX_STORAGE_STATE,
});
if (guardError) {
  console.error(`✗ ${guardError}`);
  process.exit(1);
}

if (!skipSeed) {
  run('pnpm', ['exec', 'tsx', 'e2e/seed-storage-state.ts']);
}

run('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)]);
