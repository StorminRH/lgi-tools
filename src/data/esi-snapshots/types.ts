import type { EsiResponseHeaders } from '@/platform/esi/response-metadata';
import type { EsiOwnerType } from '@/platform/owner-sync/owner-type';

export type EsiSnapshotResponseHeaders = EsiResponseHeaders;

export interface EsiSnapshotSource {
  readonly endpoint: string;
  readonly items: unknown[];
  readonly responseHeaders: EsiSnapshotResponseHeaders;
}

export interface InsertEsiSnapshotInput {
  readonly ownerType: EsiOwnerType;
  readonly ownerId: number;
  readonly endpoint: string;
  readonly requestHash: string;
  readonly etag: string | null;
  readonly responseHeaders: EsiSnapshotResponseHeaders;
  readonly fetchedAt: Date;
  readonly sourceVersion: string;
  readonly bodyCiphertext: string;
}
