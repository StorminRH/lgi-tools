/**
 * Duration in whole days for snapshot retention; retention code treats the boundary as a shared
 * policy.
 */
export const SNAPSHOT_RETENTION_DAYS = 7;

/**
 * Closed, canonically ordered set of esi snapshot owner types; consumers derive validation,
 * unions, and iteration from this one list.
 */
export const ESI_SNAPSHOT_OWNER_TYPES = ['character', 'corporation'] as const;
/** Closed snapshot owner kinds used to interpret the stored owner identifier. */
export type EsiSnapshotOwnerType = (typeof ESI_SNAPSHOT_OWNER_TYPES)[number];
