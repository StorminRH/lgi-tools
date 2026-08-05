/**
 * CLI: seed Better Auth E2E pilot + write Playwright storage state.
 *   pnpm e2e:seed
 *   pnpm e2e:seed -- --out=path/to/auth-storage.json
 */
import {
  DEFAULT_STORAGE_STATE_PATH,
  seedE2eStorageState,
} from './auth-seed';

async function main() {
  let outPath = DEFAULT_STORAGE_STATE_PATH;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  const written = await seedE2eStorageState(outPath);
  console.log(`✓ E2E auth storage state → ${written}`);
  // Better Auth / DB handles can keep the event loop alive after CLI work finishes.
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('✗ e2e seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
