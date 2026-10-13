import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { insertWithinCap } from '@/db/capped-insert';
import { industryProfiles } from '../schema';
import type { IndustryProfileRow } from './api-contract';
import { MAX_PROFILES_PER_USER, type ProfileDocument, readStoredDocument } from './profile-document';

/** Always SQL (and() may return undefined), so it can scope the profile cap too. */
const ownedLive = (userId: string): SQL =>
  sql`(${eq(industryProfiles.userId, userId)} and ${isNull(industryProfiles.deletedAt)})`;

const ownedLiveProfile = (userId: string, id: string) =>
  and(ownedLive(userId), eq(industryProfiles.id, id));

export async function listIndustryProfiles(userId: string): Promise<IndustryProfileRow[]> {
  const rows = await db
    .select({
      id: industryProfiles.id,
      name: industryProfiles.name,
      revision: industryProfiles.revision,
      document: industryProfiles.document,
      updatedAt: industryProfiles.updatedAt,
    })
    .from(industryProfiles)
    .where(ownedLive(userId))
    .orderBy(asc(industryProfiles.createdAt), asc(industryProfiles.id));
  return rows.map((r) => ({ ...r, document: readStoredDocument(r.document), updatedAt: r.updatedAt.toISOString() }));
}

export async function getIndustryProfileDocument(
  userId: string,
  id: string,
): Promise<ProfileDocument | null> {
  const [row] = await db
    .select({ document: industryProfiles.document })
    .from(industryProfiles)
    .where(ownedLiveProfile(userId, id))
    .limit(1);
  return row ? readStoredDocument(row.document) : null;
}

/**
 * Saves a new profile unless the account already holds the most live profiles
 * it may; deleted ones do not count. Returns whether the profile landed.
 */
export function createIndustryProfile(
  userId: string,
  input: { id: string; name: string; document: ProfileDocument },
): Promise<boolean> {
  return insertWithinCap({
    table: industryProfiles,
    values: { ...input, userId },
    scope: ownedLive(userId),
    cap: MAX_PROFILES_PER_USER,
  });
}

/**
 * Writes only when the stored revision is still the one the editor started
 * from, so two tabs cannot silently overwrite each other. Returns whether the
 * write landed.
 */
export async function updateIndustryProfile(
  userId: string,
  input: { id: string; expectedRevision: number; name: string; document: ProfileDocument },
): Promise<boolean> {
  const updated = await db
    .update(industryProfiles)
    .set({
      name: input.name,
      document: input.document,
      revision: sql`${industryProfiles.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        ownedLiveProfile(userId, input.id),
        eq(industryProfiles.revision, input.expectedRevision),
      ),
    )
    .returning({ id: industryProfiles.id });
  return updated.length > 0;
}

export async function deleteIndustryProfile(userId: string, id: string): Promise<void> {
  await db
    .update(industryProfiles)
    .set({ deletedAt: new Date() })
    .where(ownedLiveProfile(userId, id));
}
