import type { EsiSnapshotOwnerType } from './constants';
import type { EsiResponseHeaders } from '@/lib/esi/response-metadata';

export type EsiSnapshotResponseHeaders = EsiResponseHeaders;

export interface EsiSnapshotSource {
  readonly endpoint: string;
  readonly items: unknown[];
  readonly responseHeaders: EsiSnapshotResponseHeaders;
}

export interface InsertEsiSnapshotInput {
  readonly ownerType: EsiSnapshotOwnerType;
  readonly ownerId: number;
  readonly endpoint: string;
  readonly requestHash: string;
  readonly etag: string | null;
  readonly responseHeaders: EsiSnapshotResponseHeaders;
  readonly fetchedAt: Date;
  readonly sourceVersion: string;
  readonly bodyCiphertext: string;
}
