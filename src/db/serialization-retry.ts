import { sleep } from '@/lib/retry';
import { isSerializationFailure } from './pg-errors';

/** Tries per statement, the first included, before a serialization failure reaches the caller. */
const SERIALIZABLE_ATTEMPTS = 10;
/** The pause before retry n is n times a random 5-25 ms, so a crowd of losers spreads further apart each round. */
const RETRY_PAUSE_MIN_MS = 5;
const RETRY_PAUSE_SPREAD_MS = 20;

/**
 * Runs `attempt` until it settles, rerunning it after a short jittered pause
 * only while Postgres rejects it as a serialization failure. Every other error,
 * and the last failure once the attempts run out, reaches the caller unchanged.
 * Each attempt must be a whole transaction of its own, so a rejected one left
 * nothing behind.
 */
export async function retrySerializationFailures<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (tries >= SERIALIZABLE_ATTEMPTS || !isSerializationFailure(error)) throw error;
      await sleep(tries * (RETRY_PAUSE_MIN_MS + Math.random() * RETRY_PAUSE_SPREAD_MS));
    }
  }
}
