import {
  hasTimeoutAbort,
  isNeonColdStartError,
  pauseBeforeRetry,
} from '@/lib/neon-cold-start-retry';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

function isWarmRetryable(err: unknown): boolean {
  return isNeonColdStartError(err) || hasTimeoutAbort(err);
}

export async function warmNeon(read: () => Promise<unknown>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await read();
      if (attempt > 1) {
        console.warn(`[warm-neon] recovered after ${attempt} attempts`);
      }
      return;
    } catch (err) {
      if (!isWarmRetryable(err) || attempt >= MAX_ATTEMPTS) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      await pauseBeforeRetry('warm-neon', attempt, MAX_ATTEMPTS, err, delayMs);
    }
  }
}
