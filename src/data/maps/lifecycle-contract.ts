/** Exclusive durable map phase. One row holds one of these, never a timestamp combination. */
export const MAP_LIFECYCLE_STATUSES = [
  'active',
  'archived',
  'purge_queued',
  'purge_claimed',
  'tombstoned',
] as const;

/** One exclusive Neon `maps` lifecycle phase. */
export type MapLifecycleStatus = (typeof MAP_LIFECYCLE_STATUSES)[number];

export function activeMapLifecycle(enteredAt: Date) {
  return {
    lifecycleStatus: 'active' as const,
    lifecycleEnteredAt: enteredAt,
    archivedAt: null,
    purgeRequestedAt: null,
    purgeClaimedAt: null,
    tombstonedAt: null,
  };
}

export function archivedMapLifecycle(enteredAt: Date) {
  return {
    lifecycleStatus: 'archived' as const,
    lifecycleEnteredAt: enteredAt,
    archivedAt: enteredAt,
    purgeRequestedAt: null,
    purgeClaimedAt: null,
    tombstonedAt: null,
  };
}

export function purgeQueuedMapLifecycle(enteredAt: Date, archivedAt: Date) {
  return {
    lifecycleStatus: 'purge_queued' as const,
    lifecycleEnteredAt: enteredAt,
    archivedAt,
    purgeRequestedAt: enteredAt,
    purgeClaimedAt: null,
    tombstonedAt: null,
  };
}

export function subjectArchivedAt(
  status: MapLifecycleStatus,
  archivedAt: Date | null,
  enteredAt: Date,
): Date | null {
  return status === 'active' ? null : (archivedAt ?? enteredAt);
}
