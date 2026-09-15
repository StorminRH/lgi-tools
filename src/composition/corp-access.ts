import { after } from 'next/server';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
import { createCorpAccessSnapshot, type UserCorpAccess } from '@/platform/auth/corp-access';
import { reconcileAffiliationAccess } from './map-affiliation-access';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

/** Fresh requests read once; after ESI, recheck links so an in-flight unlink cannot grant access. */
export async function resolveUserCorpAccess(userId: string): Promise<UserCorpAccess> {
  const affiliations = await getUserAffiliations(userId);
  const now = new Date();
  const staleIds = affiliations
    .filter((row) => AFFILIATION_FRESHNESS.isStale(row.refreshedAt, now))
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
