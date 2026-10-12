import { after } from 'next/server';
import { isExpired } from '@/data/esi-store';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
import { createCorpAccessSnapshot, type UserCorpAccess } from '@/platform/auth/corp-access';
import { reconcileAffiliationAccess } from './map-affiliation-access';

/** The user's corp membership from stored affiliations, refreshing first the ones CCP's expiry no longer covers. */
export async function resolveUserCorpAccess(userId: string): Promise<UserCorpAccess> {
  const affiliations = await getUserAffiliations(userId);
  const now = Date.now();
  const staleIds = affiliations
    .filter((row) => isExpired(row.expiresAt?.getTime() ?? null, now))
    .map((row) => row.characterId);
  if (staleIds.length === 0) return createCorpAccessSnapshot(userId, affiliations);
  const refreshed = await refreshAffiliationsWithOutcome(staleIds);
  if (refreshed.accessChanged) after(reconcileAffiliationAccess);
  return createCorpAccessSnapshot(
    userId,
    await getUserAffiliations(userId),
    refreshed.transientFailure,
  );
}
