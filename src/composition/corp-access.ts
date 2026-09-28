import { after } from 'next/server';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { AFFILIATION_FRESHNESS } from '@/platform/auth/affiliation-policy';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
import { createCorpAccessSnapshot, type UserCorpAccess } from '@/platform/auth/corp-access';
import { reconcileAffiliationAccess } from './map-affiliation-access';

export async function resolveUserCorpAccess(userId: string): Promise<UserCorpAccess> {
  const affiliations = await getUserAffiliations(userId);
  const now = new Date();
  const staleIds = affiliations
    .filter((row) => AFFILIATION_FRESHNESS.isStale(row.refreshedAt, now))
    .map((row) => row.characterId);
  if (staleIds.length === 0) return createCorpAccessSnapshot(userId, affiliations);
  const refreshed = await refreshAffiliationsWithOutcome(staleIds);
  const current = await getUserAffiliations(userId);
  if (refreshed.accessChanged) {
    // Include old corporations so departure revocations are delivered too.
    const corporationIds = [...new Set([...affiliations, ...current]
      .flatMap((row) => row.corporationId === null ? [] : [row.corporationId]))];
    after(() => reconcileAffiliationAccess({ corporationIds }));
  }
  return createCorpAccessSnapshot(
    userId,
    current,
    refreshed.transientFailure,
  );
}
