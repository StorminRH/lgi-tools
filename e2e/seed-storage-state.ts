import {
  DEFAULT_STORAGE_STATE_PATH,
  PLAIN_STORAGE_STATE_PATH,
  seedE2eStorageState,
} from './auth-seed';
import { SYNTHETIC_CONTRIBUTOR } from '@/platform/auth/synthetic-pilot';

async function main() {
  let outPath = DEFAULT_STORAGE_STATE_PATH;
  let plainOutPath = PLAIN_STORAGE_STATE_PATH;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
    if (arg.startsWith('--plain-out=')) plainOutPath = arg.slice('--plain-out='.length);
  }
  const written = await seedE2eStorageState(outPath);
  console.log(`✓ E2E auth storage state → ${written}`);
  const plain = await seedE2eStorageState(plainOutPath, SYNTHETIC_CONTRIBUTOR);
  console.log(`✓ E2E plain signed-in storage state → ${plain}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('✗ e2e seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
