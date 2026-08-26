// Pure chain tombstone vocabulary shared by Convex mutations, cleanup, and the
// mapper read hook. It holds no database, framework, or slice import so both
// runtimes normalize active/tombstoned the same way without either owning the
// other's storage shape.

import type { ConnectionTombstone } from '@/data/maps/connection-hallway';
import { connectionTombstoneStamps } from '@/data/maps/connection-hallway';

/** Standard reversible-undo window for chain system and connection tombstones. */
export const MAP_CHAIN_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The stamp pair a tombstone mutation writes onto one mapSystems document. */
export interface ChainTombstoneStamps {
  readonly deletedAt: number;
  readonly purgeAfter: number;
}

/** The presentation stage of one active or tombstoned chain row. */
export type ChainTombstoneState = 'active' | 'dying' | 'skeleton';

/** Builds the paired tombstone stamps for one absolute system deletion instant. */
export function chainTombstoneStamps(deletedAt: number): ChainTombstoneStamps {
  return {
    deletedAt,
    purgeAfter: deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
  };
}

/** Removed-hallway tombstone with the same undo window as a system pair. */
export function connectionRemovedTombstone(deletedAt: number): {
  readonly tombstone: ConnectionTombstone;
} {
  return connectionTombstoneStamps(
    deletedAt,
    deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
  );
}

/** Connection tombstone union or the system stamp pair. Missing row is live. */
export type ChainTombstoneRow = {
  readonly tombstone?: {
    readonly kind: 'live' | 'removed';
    readonly deletedAt?: number;
    readonly purgeAfter?: number | null;
  };
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
} | null | undefined;

/**
 * Whether a chain row is tombstoned. Connections store a tombstone union.
 * Systems still store the stamp pair (`undefined`/`null` = live).
 */
export function isTombstoned(row: ChainTombstoneRow): boolean {
  if (row == null) return false;
  if (row.tombstone !== undefined) return row.tombstone.kind === 'removed';
  return typeof row.deletedAt === 'number' && Number.isFinite(row.deletedAt);
}

/** Absolute delete stamp, or null when the row is live. */
export function tombstoneDeletedAt(row: ChainTombstoneRow): number | null {
  if (row == null) return null;
  if (row.tombstone !== undefined) {
    if (row.tombstone.kind !== 'removed') return null;
    return typeof row.tombstone.deletedAt === 'number'
      && Number.isFinite(row.tombstone.deletedAt)
      ? row.tombstone.deletedAt
      : null;
  }
  return typeof row.deletedAt === 'number' && Number.isFinite(row.deletedAt)
    ? row.deletedAt
    : null;
}

/** Undo-window purge stamp, or null when the row is live or already skeleton. */
export function tombstonePurgeAfter(row: ChainTombstoneRow): number | null {
  if (row == null) return null;
  if (row.tombstone !== undefined) {
    return row.tombstone.kind === 'removed' ? (row.tombstone.purgeAfter ?? null) : null;
  }
  return row.purgeAfter ?? null;
}

/**
 * Normalizes a chain row into the live → dying → skeleton lifecycle. A finite
 * future purge stamp remains visibly undoable; an absent, cleared, or elapsed
 * stamp is a structural skeleton even before the cleanup sweep catches up.
 */
export function chainTombstoneState(
  row: ChainTombstoneRow,
  now: number,
): ChainTombstoneState {
  if (!isTombstoned(row)) return 'active';
  const purgeAfter = tombstonePurgeAfter(row);
  return typeof purgeAfter === 'number' &&
    Number.isFinite(purgeAfter) &&
    purgeAfter > now
    ? 'dying'
    : 'skeleton';
}
