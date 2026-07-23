import type { EsiSnapshotOwnerType } from './constants';
import type { EsiResponseHeaders } from '@/platform/esi/response-metadata';

/** Normalized cache and rate-limit response headers retained with a raw ESI snapshot. */
export type EsiSnapshotResponseHeaders = EsiResponseHeaders;

/**
 * Decrypted raw snapshot source returned for replay, including payload, headers, and absolute
 * capture time.
 */
export interface EsiSnapshotSource {
  readonly endpoint: string;
  readonly items: unknown[];
  readonly responseHeaders: EsiSnapshotResponseHeaders;
}

/**
 * Validated encrypted-snapshot insert contract including owner, request identity, source metadata,
 * and payload.
 */
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
