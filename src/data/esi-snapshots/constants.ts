/**
 * Configured esi snapshots limit for snapshot retention days; callers use this value instead of
 * embedding a competing threshold.
 */
export const SNAPSHOT_RETENTION_DAYS = 7;

/**
 * Closed esi snapshots vocabulary and canonical order for esi snapshot owner types; consumers
 * derive validation and iteration from this one list.
 */
export const ESI_SNAPSHOT_OWNER_TYPES = ['character', 'corporation'] as const;
/** Closed snapshot owner kinds used to interpret the stored owner identifier. */
export type EsiSnapshotOwnerType = (typeof ESI_SNAPSHOT_OWNER_TYPES)[number];
