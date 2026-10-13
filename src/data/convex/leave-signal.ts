import { postBeacon } from '@/transport/beacon';
import { leaveSyncEndpoint } from './api-contract';
import type { SyncDataset } from '@/lib/sync-engine';

export function postLeaveBeacon(input: {
  readonly dataset: SyncDataset;
  readonly tabId: string;
}): void {
  postBeacon(leaveSyncEndpoint, { dataset: input.dataset, tabId: input.tabId });
}
