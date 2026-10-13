import { isExpired } from '@/data/esi-store';
import { runAfterResponse } from '@/lib/after-response';
import { getNavServerStatus } from './queries';
import { refreshServerStatusOnView } from './refresh';
import type { ServerStatus } from './types';

/**
 * The stored status for a real view: shown at once, and refreshed behind
 * the response when CCP's expiry has passed, so the next view sees the new
 * one. Call it after `connection()`, since after() runs at build time in a
 * static tree.
 */
export async function getServerStatusOnView(): Promise<ServerStatus> {
  const { status, expiresAt } = await getNavServerStatus();
  if (isExpired(expiresAt, Date.now())) {
    runAfterResponse('eve-status', 'status refresh', refreshServerStatusOnView);
  }
  return status;
}
