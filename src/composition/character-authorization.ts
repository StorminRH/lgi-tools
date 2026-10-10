import { cache } from 'react';
import { enqueueAffectedMapAccessChanges } from '@/data/maps/queries';
import { bestEffort } from '@/lib/best-effort';
import { mapConcurrent } from '@/lib/fan-out';
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

const AUTHORIZATION_CONCURRENCY = 4;

async function publishAccessChanges(userId: string): Promise<void> {
  await suspendOverdueAuthorizations(userId);
  for (const change of await listAuthorizationAccessChanges(userId)) {
    if (change.changedAt === null) continue;
    // Persist into the existing map outbox before acknowledging. A crash only causes a harmless replay.
    await enqueueAffectedMapAccessChanges(Number(change.characterId));
    await acknowledgeAuthorizationAccessChange(change.id, change.changedAt);
  }
  await reconcileAffiliationAccess();
}

/**
 * Verifies one user's linked characters while that user is on the site. Each
 * character is re-checked with EVE at most daily; nothing runs for absent users.
 */
export async function checkCharacterAuthorizations(userId: string): Promise<void> {
  if (!await hasAuthorizationWork(userId)) {
    await reconcileAffiliationAccess();
    return;
  }
  const deadline = Date.now() + 35_000;
  // Revoke already-known invalid/overdue access before any slow network requests.
  await publishAccessChanges(userId);
  const due = await listDueAuthorizations(userId);
  // A failed claim (store outage) rejects the run and stops further claims.
  await mapConcurrent(due, AUTHORIZATION_CONCURRENCY, async (candidate) => {
    if (Date.now() >= deadline) return;
    if (!await claimAuthorization(candidate.id)) return;
    // The claim expires, so a process/network failure cannot strand the character.
    await bestEffort('character-authorization', 'check', candidate.characterId, () =>
      getFreshAccessTokenForCharacter(Number(candidate.characterId), { forceRefresh: true }),
    );
  });
  await publishAccessChanges(userId);
}

export const checkUserCharacterAuthorizations = cache((userId: string): Promise<void> =>
  bestEffort('character-authorization', 'background check', userId, () =>
    checkCharacterAuthorizations(userId),
  ),
);
