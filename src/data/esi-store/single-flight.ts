import { sql } from 'drizzle-orm';
import { db, directClient } from '@/db';
import { withAdvisoryLock, type AdvisoryLockOutcome } from '@/db/advisory-lock';
import { executeRows } from '@/lib/db-execute';

/**
 * One refresh at a time per global key, across every instance. The key is
 * Postgres's own 64-bit hash of the row identity, so it needs no registry
 * entry, and a second caller finds the lock busy and serves the stored
 * copy instead of calling ESI as well. The lock spans the ESI call, as the
 * cron gate's does, and is taken only once a key is due.
 */
export async function withGlobalSingleFlight<T>(
  lockText: string,
  work: () => Promise<T>,
): Promise<AdvisoryLockOutcome<T>> {
  const [row] = await executeRows<{ key: string }>(
    db,
    sql`select hashtextextended(${lockText}, 0)::text as key`,
  );
  if (row === undefined) throw new Error('advisory lock key query returned no row');
  return withAdvisoryLock(directClient, BigInt(row.key), () => work());
}
