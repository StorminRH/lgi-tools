import { after } from 'next/server';
import { bestEffort } from '@/lib/best-effort';
import { recordNetWorthSnapshot, refreshBoardDatasets } from './board-view';

/**
 * A link, unlink or transfer changes the account's roster, so today's day is rewritten rather than left for
 * the nightly revalue: a new pilot's datasets sync first (its gates are all stale, so this is its first ESI
 * pull), then the roster is valued. It runs after the response so the SSO redirect never waits on ESI;
 * outside a request scope it runs inline.
 */
export async function revalueAfterRosterChange(userId: string): Promise<void> {
  const task = () =>
    bestEffort('net-worth', 'revalueAfterRosterChange', userId, async () => {
      await refreshBoardDatasets(userId);
      await recordNetWorthSnapshot(userId);
    });
  try {
    after(task);
  } catch {
    await task();
  }
}
