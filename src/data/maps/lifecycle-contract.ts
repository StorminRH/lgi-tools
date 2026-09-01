export const MAP_LIFECYCLE_STATUSES = [
  'active',
  'archived',
  'purge_queued',
  'purge_claimed',
  'tombstoned',
] as const;

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

export function tombstonedMapLifecycle(enteredAt: Date, archivedAt: Date) {
  return {
    lifecycleStatus: 'tombstoned' as const,
    lifecycleEnteredAt: enteredAt,
    archivedAt,
    tombstonedAt: enteredAt,
  };
}
