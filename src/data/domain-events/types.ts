/** Closed durable domain-event vocabulary shared by writers, storage, and operations views. */
export const DOMAIN_EVENT_TYPES = [
  'price_refresh_finished',
  'esi_snapshot_pulled',
  'eve_token_state_changed',
  'esi_refresh_job_status_changed',
  'esi_budget_guard_exhausted',
] as const;

type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

interface DomainEventMetadataByType {
  price_refresh_finished: {
    outcome: 'completed' | 'degraded';
    fetched: number;
    written: number;
    esiCount: number;
    fuzzworkFallbackCount: number;
    budgetExhausted: boolean;
    durationMs: number;
  };
  esi_snapshot_pulled: {
    snapshotId: number;
    dataset: 'owned_assets';
    ownerType: 'corporation';
    ownerId: number;
    itemCount: number;
  };
  eve_token_state_changed: {
    characterId: number;
    from: 'usable' | 'suspect';
    to: 'usable' | 'suspect' | 'reauth_required';
    reason: 'invalid_grant' | 'refresh_recovered';
  };
  esi_refresh_job_status_changed: {
    jobId: number;
    dataset: string;
    ownerType: 'character' | 'corporation';
    ownerId: number;
    status: 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'dead_lettered';
    attemptCount: number;
    failureCode: string | null;
  };
  esi_budget_guard_exhausted: {
    count: number;
    windowMinutes: number;
    windowStartedAt: string;
    windowEndedAt: string;
  };
}

/**
 * Closed privacy-safe metadata carried by durable domain events; values contain taxonomy and
 * counts, never secrets or raw owner identity.
 */
export type DomainEventMetadata = DomainEventMetadataByType[DomainEventType];

/**
 * A discriminated union keeps every event's metadata closed at the call site.
 * There is deliberately no generic extension bag: new stored knowledge must be
 * named here and reviewed before an emitter can persist it.
 */
export type DomainEventInput = {
  [TEvent in DomainEventType]: {
    eventType: TEvent;
    metadata: DomainEventMetadataByType[TEvent];
  };
}[DomainEventType];

/** Stored domain-event view with event type, privacy-safe metadata, and absolute creation timestamp. */
export type DomainEventRow = DomainEventInput & {
  id: number;
  occurredAt: Date;
};
