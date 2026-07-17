import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { DomainEventMetadata } from './types';

/**
 * Internal, append-only system event ledger. Identifiers and classified
 * outcomes are allowed; token values, secrets, raw request/ESI bodies, and raw
 * error messages are not. The typed insert surface in queries.ts is the only
 * production writer, and retention is the only deletion path.
 */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').$type<DomainEventMetadata>().notNull(),
  },
  (t) => [
    index('domain_events_occurred_idx').on(t.occurredAt.desc(), t.id.desc()),
    index('domain_events_type_occurred_idx').on(
      t.eventType,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
  ],
);
