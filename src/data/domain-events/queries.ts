import { after } from 'next/server';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';
import { domainEvents } from './schema';
import type { DomainEventInput, DomainEventRow } from './types';

async function insertDomainEvent(input: DomainEventInput): Promise<void> {
  try {
    await db.insert(domainEvents).values({
      eventType: input.eventType,
      metadata: input.metadata,
    });
  } catch (error) {
    console.error('[domain-events] ledger write failed', error);
  }
}

export function emitDomainEvent(input: DomainEventInput): void {
  try {
    after(() => insertDomainEvent(input));
  } catch (error) {
    console.error('[domain-events] ledger scheduling failed', error);
  }
}

// Spelled out to match domain_events_occurred_idx (DESC NULLS LAST). Drizzle's
// desc() means NULLS FIRST, which the index cannot serve, so Postgres would
// sort the whole retention window to return one page.
export async function listRecentDomainEvents(limit: number): Promise<DomainEventRow[]> {
  const rows = await db
    .select()
    .from(domainEvents)
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
