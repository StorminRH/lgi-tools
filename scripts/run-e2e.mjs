#!/usr/bin/env node
// Runs Playwright E2E after seeding local Better Auth storage state (unless
// E2E_SKIP_SEED=1 — use when pointing at a remote base URL with an operator
// cookie jar / pre-exported storage state).
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
