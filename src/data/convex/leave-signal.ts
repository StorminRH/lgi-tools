import { apiFetch } from '@/transport/api-client';
import { leaveSyncEndpoint } from './api-contract';
import type { SyncDataset } from '@/lib/sync-engine';

export function shouldSendLeave(event: { readonly persisted: boolean }): boolean {
  return !event.persisted;
}

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
