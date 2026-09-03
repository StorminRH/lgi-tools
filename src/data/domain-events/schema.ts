import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { DomainEventMetadata } from './types';

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
