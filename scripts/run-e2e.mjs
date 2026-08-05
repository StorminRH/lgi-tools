#!/usr/bin/env node
// Runs Playwright E2E after seeding local Better Auth storage state.
// Set E2E_SKIP_SEED=1 when storage state already exists, or when pointing at a
// remote base URL with an operator-exported file via E2E_STORAGE_STATE (or
// UX_STORAGE_STATE). Cookie jars are for pnpm ux-check / run-probes — not this
// runner; Playwright specs consume storageState JSON only.
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.E2E_SKIP_SEED !== '1') {
  run('pnpm', ['exec', 'tsx', 'e2e/seed-storage-state.ts']);
}

run('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)]);
