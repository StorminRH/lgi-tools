import { after } from 'next/server';
import { desc, lt } from 'drizzle-orm';
import { db } from '@/db';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';
import { DOMAIN_EVENT_RETENTION_DAYS } from './constants';
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

export async function listRecentDomainEvents(limit: number): Promise<DomainEventRow[]> {
  const rows = await db
    .select()
    .from(domainEvents)
    .orderBy(desc(domainEvents.occurredAt), desc(domainEvents.id))
    .limit(limit);
  return rows as DomainEventRow[];
}

export function pruneDomainEvents(
  database: AnyPgDb,
  retentionDays = DOMAIN_EVENT_RETENTION_DAYS,
  now = new Date(),
  deadline?: number,
): Promise<BatchedDeleteResult> {
  const cutoff = retentionCutoff(retentionDays, now);
  return deleteInBatches(database, domainEvents, lt(domainEvents.occurredAt, cutoff), deadline);
}
