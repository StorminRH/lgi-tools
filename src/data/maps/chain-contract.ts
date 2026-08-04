// Pure chain tombstone vocabulary shared by Convex mutations, cleanup, and the
// mapper read hook. It holds no database, framework, or slice import so both
// runtimes normalize active/tombstoned the same way without either owning the
// other's storage shape.

/** Standard reversible-undo window for chain system and connection tombstones. */
export const MAP_CHAIN_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The stamp pair a tombstone mutation writes onto one chain document. */
export interface ChainTombstoneStamps {
  readonly deletedAt: number;
  readonly purgeAfter: number;
}

/** The presentation stage of one active or tombstoned chain row. */
export type ChainTombstoneState = 'active' | 'dying' | 'skeleton';

/** Builds the paired tombstone stamps for one absolute deletion instant. */
export function chainTombstoneStamps(deletedAt: number): ChainTombstoneStamps {
  return {
    deletedAt,
    purgeAfter: deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
  };
}

/**
 * Whether a chain row is tombstoned. `undefined` and `null` both mean active —
 * existing documents predate the optional fields, and active rows may store
 * explicit nulls — so this is the single normalization point for that
 * optionality.
 */
export function isTombstoned(row: {
  readonly deletedAt?: number | null;
}): boolean {
  return typeof row.deletedAt === 'number' && Number.isFinite(row.deletedAt);
}

/**
 * Normalizes a chain row into the live → dying → skeleton lifecycle. A finite
 * future purge stamp remains visibly undoable; an absent, cleared, or elapsed
 * stamp is a structural skeleton even before the cleanup sweep catches up.
 */
export function chainTombstoneState(
  row: {
    readonly deletedAt?: number | null;
    readonly purgeAfter?: number | null;
  },
  now: number,
): ChainTombstoneState {
  if (!isTombstoned(row)) return 'active';
  return typeof row.purgeAfter === 'number' &&
    Number.isFinite(row.purgeAfter) &&
    row.purgeAfter > now
    ? 'dying'
    : 'skeleton';
}
