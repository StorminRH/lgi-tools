import { after } from 'next/server';
import { desc, lt } from 'drizzle-orm';
import { db } from '@/db';
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

/**
 * Ledger writes are always additive and best-effort. A failed audit insert is
 * observable in runtime logs but can never fail the domain operation it records.
 * Next's request-lifetime primitive keeps the insert alive after a response.
 */
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
  // The closed typed writer is the only production insertion path, so the
  // stored eventType/metadata pair is a DomainEventInput by construction.
  return rows as DomainEventRow[];
}

export async function pruneDomainEvents(
  database: AnyPgDb,
  retentionDays = DOMAIN_EVENT_RETENTION_DAYS,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(domainEvents).where(lt(domainEvents.occurredAt, cutoff));
}
