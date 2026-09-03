export const SNAPSHOT_RETENTION_DAYS = 7;

export const ESI_SNAPSHOT_OWNER_TYPES = ['character', 'corporation'] as const;
export type EsiSnapshotOwnerType = (typeof ESI_SNAPSHOT_OWNER_TYPES)[number];
