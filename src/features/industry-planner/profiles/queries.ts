import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, runSerializable } from '@/db';
import { isSerializationFailure } from '@/db/pg-errors';
import { industryProfiles } from '../schema';
import type { IndustryProfileRow } from './api-contract';
import { MAX_PROFILES_PER_USER, type ProfileDocument, readStoredDocument } from './profile-document';

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

const CREATE_ATTEMPTS = 8;
/** Retry n waits a random 0 to n times this long, so rejected creates spread out. */
const CREATE_BACKOFF_MS = 20;

function pauseBeforeCreateRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * CREATE_BACKOFF_MS * attempt));
}

/**
 * Saves a new profile unless the account already holds the most it may. The
 * count and the insert are one serializable statement, so no lock is held: of
 * two creates that overlap, Postgres rejects one, and its next attempt sees the
 * other's profile. Postgres tracks those conflicts by page, so creates for
 * different accounts can reject each other too; the random pause keeps a busy
 * burst from colliding on every attempt.
 */
export async function createIndustryProfile(
  userId: string,
  input: { id: string; name: string; document: ProfileDocument },
): Promise<boolean> {
  const insert = sql`
    insert into ${industryProfiles} (id, user_id, name, document)
    select ${input.id}, ${userId}, ${input.name}, ${JSON.stringify(input.document)}::jsonb
    where (select count(*) from ${industryProfiles} where ${ownedLive(userId)}) < ${MAX_PROFILES_PER_USER}
    returning id`;
  for (let attempt = 1; ; attempt++) {
    try {
      return (await runSerializable(insert)).length > 0;
    } catch (error) {
      if (attempt >= CREATE_ATTEMPTS || !isSerializationFailure(error)) throw error;
    }
    await pauseBeforeCreateRetry(attempt);
  }
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
