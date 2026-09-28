import { cache } from 'react';
import { enqueueAffectedMapAccessChanges } from '@/data/maps/queries';
import {
  acknowledgeAuthorizationAccessChange,
  claimAuthorization,
  hasAuthorizationWork,
  listAuthorizationAccessChanges,
  listDueAuthorizations,
  suspendOverdueAuthorizations,
} from '@/platform/auth/authorization-store';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { reconcileAffiliationAccess } from './map-affiliation-access';

async function publishAccessChanges(userId?: string): Promise<void> {
  await suspendOverdueAuthorizations(userId);
  for (const change of await listAuthorizationAccessChanges(userId)) {
    if (change.changedAt === null) continue;
    // Persist into the existing map outbox before acknowledging. A crash only causes a harmless replay.
    await enqueueAffectedMapAccessChanges(Number(change.characterId));
    await acknowledgeAuthorizationAccessChange(change.id, change.changedAt);
  }
  await reconcileAffiliationAccess();
}

export async function checkCharacterAuthorizations(userId?: string): Promise<void> {
  if (!await hasAuthorizationWork(userId)) {
    if (userId === undefined) await reconcileAffiliationAccess();
    return;
  }
  const deadline = Date.now() + 35_000;
  // Revoke already-known invalid/overdue access before any slow network requests.
  await publishAccessChanges(userId);
  const due = await listDueAuthorizations(userId);
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < due.length && Date.now() < deadline) {
      const candidate = due[next++]!;
      if (!await claimAuthorization(candidate.id)) continue;
      try {
        await getFreshAccessTokenForCharacter(Number(candidate.characterId), { forceRefresh: true });
      } catch (error) {
        // The claim expires, so a process/network failure cannot strand the character.
        console.error('[character-authorization] check failed', candidate.characterId, error);
      }
    }
  }));
  await publishAccessChanges(userId);
}

export const checkUserCharacterAuthorizations = cache(async (userId: string): Promise<void> => {
  try {
    await checkCharacterAuthorizations(userId);
  } catch (error) {
    console.error('[character-authorization] background check failed', error);
  }
});
