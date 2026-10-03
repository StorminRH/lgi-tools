import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { withLockedUsers } from '@/db/locked-user';
import { industryProfiles } from '../schema';
import type { IndustryProfileRow } from './api-contract';
import { MAX_PROFILES_PER_USER, type ProfileDocument } from './profile-document';

const ownedLive = (userId: string) =>
  and(eq(industryProfiles.userId, userId), isNull(industryProfiles.deletedAt));

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
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
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
  return row?.document ?? null;
}

export async function createIndustryProfile(
  userId: string,
  input: { id: string; name: string; document: ProfileDocument },
): Promise<boolean> {
  return withLockedUsers([userId], async (tx) => {
    const [row] = await tx.select({ n: count() }).from(industryProfiles).where(ownedLive(userId));
    if ((row?.n ?? 0) >= MAX_PROFILES_PER_USER) return false;
    await tx.insert(industryProfiles).values({ userId, ...input });
    return true;
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
