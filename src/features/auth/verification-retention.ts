import { lt } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import { verification } from './schema';

export async function pruneExpiredVerifications(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(verification).where(lt(verification.expiresAt, cutoff));
}
