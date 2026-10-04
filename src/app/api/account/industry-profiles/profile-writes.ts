import { randomUUID } from 'node:crypto';
import { createIndustryProfile } from '@/features/industry-planner/profiles/queries';
import {
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

export async function insertWithinCap(
  userId: string,
  input: { name: string; document: ProfileDocument },
): Promise<string | null> {
  const id = randomUUID();
  return await createIndustryProfile(userId, { id, ...input }) ? id : null;
}
