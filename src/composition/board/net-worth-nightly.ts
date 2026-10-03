import { listUserIdsWithLinkedCharacters } from '@/platform/auth/linked-characters';
import { recordNetWorthSnapshot } from './board-view';

export interface NetWorthRevalueSummary {
  accounts: number;
  revalued: number;
  failed: number;
  /** Accounts left for tomorrow because the run reached its deadline. */
  deferred: number;
}

const DAY_MS = 86_400_000;

/** Starts the list one place further on each UTC day, so a deadline cuts a different tail every night. */
function rotateByDay<T>(items: readonly T[], now: Date): T[] {
  const start = items.length === 0 ? 0 : Math.floor(now.getTime() / DAY_MS) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/**
 * Revalues every account with a linked pilot from the holdings and prices already in Neon, after the
 * nightly price sweep, so each account gets one day per day at one set of prices whether or not anyone
 * opened the board. Makes no ESI call. A failed account is logged and skipped; the run stops starting new
 * accounts at the deadline.
 */
export async function revalueAllNetWorth(deadline: number, now = new Date()): Promise<NetWorthRevalueSummary> {
  const userIds = rotateByDay(await listUserIdsWithLinkedCharacters(), now);
  const summary: NetWorthRevalueSummary = { accounts: userIds.length, revalued: 0, failed: 0, deferred: 0 };
  for (const [i, userId] of userIds.entries()) {
    if (Date.now() >= deadline) {
      summary.deferred = userIds.length - i;
      break;
    }
    try {
      await recordNetWorthSnapshot(userId, now);
      summary.revalued += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(JSON.stringify({ scope: 'net-worth:revalue', userId, error: String(error) }));
    }
  }
  return summary;
}
