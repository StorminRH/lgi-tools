// Audited corp-access gate (3.7.3.3) — the first consumer of the 3.7.3.2 membership
// primitive and the reusable groundwork the v4.0 mapper's corp auto-grant/revoke
// will build on. A standalone, corp-id-parameterized, FAIL-CLOSED decision:
//
//   refresh stale affiliations → decide on ≤1h-fresh data → record the decision
//
// FAIL CLOSED falls straight out of the membership primitive: null/stale
// affiliations are not a member, and the refresh is best-effort (a refresh that
// can't reach ESI leaves the cache stale ⇒ deny). EVERY decision is recorded —
// allow AND deny — and the audit write is AWAITED (audit-grade, not fire-and-forget
// telemetry) so an unauditable grant can't happen silently.
//
// This is the decision only; rendering is the consumer's job. A route computes
// `blocked = !decision.allowed` and feeds the 3.7.1.2 AccessGate — out of scope here.
import { refreshStaleAffiliationsForUser } from './affiliation';
import { memberCharacterIdInCorp } from './membership';
import { getUserAffiliations, recordCorpAccessDecision } from './affiliation-store';

/**
 * Why a decision went the way it did. Plain text in the audit ledger (no DB enum),
 * so a finer-grained reason can be added later without a migration.
 */
export const CORP_ACCESS_REASONS = ['member', 'not_member'] as const;
export type CorpAccessReason = (typeof CORP_ACCESS_REASONS)[number];

export interface CorpAccessDecision {
  allowed: boolean;
  reason: CorpAccessReason;
  // The linked pilot whose fresh affiliation granted access; null on a deny.
  characterId: number | null;
}

/**
 * Decide whether this user may access corporationId's scope, on ≤1h-fresh
 * affiliation, and record the decision. The two affiliation reads (the stale-scan
 * inside refreshStaleAffiliationsForUser, then the post-refresh read here) are the
 * inherent cost of deciding on freshly-refreshed data.
 */
export async function decideCorpAccess(input: {
  userId: string;
  corporationId: number;
}): Promise<CorpAccessDecision> {
  const { userId, corporationId } = input;
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const characterId = memberCharacterIdInCorp(affiliations, corporationId, new Date());
  const allowed = characterId !== null;
  const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
