import type { PriceSourceCounts } from '@/lib/alerts';

export const DOMAIN_EVENT_TYPES = [
  'price_refresh_finished',
  'esi_snapshot_pulled',
  'eve_token_state_changed',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export interface DomainEventMetadataByType {
  price_refresh_finished: PriceSourceCounts & {
    outcome: 'completed' | 'degraded';
    written: number;
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
}

export type DomainEventMetadata = DomainEventMetadataByType[DomainEventType];

export type DomainEventInput = {
  [TEvent in DomainEventType]: {
    eventType: TEvent;
    metadata: DomainEventMetadataByType[TEvent];
  };
}[DomainEventType];

export type DomainEventRow = DomainEventInput & {
  id: number;
  occurredAt: Date;
};
