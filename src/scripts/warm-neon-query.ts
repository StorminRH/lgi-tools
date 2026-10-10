import { withColdStartRetry } from '@/lib/neon-cold-start-retry';

/** Wakes Neon before the build reads it, retrying a cold start or a timed-out connect. */
export async function warmNeon(read: () => Promise<unknown>): Promise<void> {
  await withColdStartRetry(read, { label: 'warm-neon', retryTimeouts: true });
}
