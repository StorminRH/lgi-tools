import { randomUUID } from 'node:crypto';
import {
  countIndustryProfiles,
  createIndustryProfile,
  deleteIndustryProfile,
} from '@/features/industry-planner/profiles/queries';
import {
  MAX_PROFILES_PER_USER,
  type ProfileDocument,
  unlinkedNewMembers,
} from '@/features/industry-planner/profiles/profile-document';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';

/** True when the write would add a member this account does not link. */
export async function addsUnlinkedMembers(
  userId: string,
  next: ProfileDocument,
  previous: ProfileDocument | null,
): Promise<boolean> {
  const linked = new Set((await listLinkedCharacters(userId)).map((c) => c.characterId));
  return unlinkedNewMembers(next, previous, linked).length > 0;
}

/**
 * Inserts a profile under the per-account cap. The recount after the insert
 * undoes a write that a concurrent create pushed over the cap.
 */
export async function insertWithinCap(
  userId: string,
  input: { name: string; document: ProfileDocument },
): Promise<string | null> {
  if ((await countIndustryProfiles(userId)) >= MAX_PROFILES_PER_USER) return null;
  const id = randomUUID();
  await createIndustryProfile(userId, { id, ...input });
  if ((await countIndustryProfiles(userId)) <= MAX_PROFILES_PER_USER) return id;
  await deleteIndustryProfile(userId, id);
  return null;
}
