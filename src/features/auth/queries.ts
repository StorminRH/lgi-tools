import { lt } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import { verification } from './schema';

// AF-004 migration map: linked-character, affiliation, admin-user,
// owner-transfer, and account-purge ownership now lives in the axis modules
// with every caller repointed directly. The final retention leaf moves next,
// then this temporary hub is deleted without a compatibility facade.

// [3.8.5.4 owner: verification-retention]
export async function pruneExpiredVerifications(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(verification).where(lt(verification.expiresAt, cutoff));
}
