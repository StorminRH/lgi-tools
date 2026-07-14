import { lt } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { DOMAIN_EVENT_RETENTION_DAYS } from './constants';
import { domainEvents } from './schema';
import type { DomainEventInput } from './types';

async function insertDomainEvent(input: DomainEventInput): Promise<void> {
  await db.insert(domainEvents).values({
    eventType: input.eventType,
    metadata: input.metadata,
  });
}

// Ledger writes are always additive and best-effort. A failed audit insert is
// observable in runtime logs but can never fail the domain operation it records.
export function emitDomainEvent(input: DomainEventInput): void {
  void insertDomainEvent(input).catch((error) => {
    console.error('[domain-events] ledger write failed', error);
  });
}

export async function pruneDomainEvents(
  database: AnyPgDb,
  retentionDays = DOMAIN_EVENT_RETENTION_DAYS,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(domainEvents).where(lt(domainEvents.occurredAt, cutoff));
}
