import { inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { runAfterResponse } from '@/lib/after-response';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';
import { domainEvents } from './schema';
import { DOMAIN_EVENT_TYPES, type DomainEventInput, type DomainEventRow } from './types';

export function emitDomainEvent(input: DomainEventInput): void {
  runAfterResponse('domain-events', 'ledger', async () => {
    await db.insert(domainEvents).values({
      eventType: input.eventType,
      metadata: input.metadata,
    });
  });
}

// Spelled out to match domain_events_occurred_idx (DESC NULLS LAST). Drizzle's
// desc() means NULLS FIRST, which the index cannot serve, so Postgres would
// sort the whole retention window to return one page. Only the current
// vocabulary is read: rows of a retired type (the old ESI queue and budget
// events) stay until retention prunes them and have no summary to show.
export async function listRecentDomainEvents(limit: number): Promise<DomainEventRow[]> {
  const rows = await db
    .select()
    .from(domainEvents)
    .where(inArray(domainEvents.eventType, [...DOMAIN_EVENT_TYPES]))
    .orderBy(sql`${domainEvents.occurredAt} desc nulls last`, sql`${domainEvents.id} desc nulls last`)
    .limit(limit);
  return rows as DomainEventRow[];
}

export function pruneDomainEvents(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
  deadline?: number,
): Promise<BatchedDeleteResult> {
  const cutoff = retentionCutoff(retentionDays, now);
  return deleteInBatches(database, domainEvents, lt(domainEvents.occurredAt, cutoff), deadline);
}
