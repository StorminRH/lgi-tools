// Pure leave-beacon decision + transport. pagehide with persisted=false is
// a real document death (tab close, refresh, cross-document navigation).
// visibilitychange-hidden is not leave — Atlas behind EVE must keep tracking.
// Effect cleanup is not leave — Strict Mode and the AFK pause would false-fire.
import { apiFetch } from '@/transport/api-client';
import { leaveSyncEndpoint } from './api-contract';
import type { SyncDataset } from '@/lib/sync-engine';

/** True when pagehide means the document is going away, not entering bfcache. */
export function shouldSendLeave(event: { readonly persisted: boolean }): boolean {
  return !event.persisted;
}

/** Queues one leave beacon; browser or network failure is ignored. */
export function postLeaveBeacon(input: {
  readonly dataset: SyncDataset;
  readonly tabId: string;
}): void {
  const body = { dataset: input.dataset, tabId: input.tabId };
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const ok = navigator.sendBeacon(leaveSyncEndpoint.path, blob);
    if (ok) return;
  }
  void apiFetch(leaveSyncEndpoint, { body, keepalive: true }).catch(() => undefined);
}
