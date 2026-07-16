// Corp-membership predicates (3.7.3.2) — the reusable "is character X / this user
// in corp C right now?" primitive the 3.7.3.3 audited access gate, structure
// sharing (3.7.9), and the v4.0 mapper's corp auto-grant/revoke all consume.
//
// PURE + dependency-free on purpose: no DB, no ESI, no clock. The cached
// affiliation rows are loaded by the DB readers in affiliation-store.ts; the
// freshness `now` is injected by the caller. That keeps the allow/deny logic unit-testable
// in isolation and lets the gate compose load → (refresh if stale) → decide at
// the app layer (the 3.7.1.2 AccessGate `blocked`-computed-upstream pattern).
//
// FAIL CLOSED: a null (never-refreshed) or stale (> TTL) affiliation reads as
// "not a member", so an un-refreshed character never leaks corp access. The
// accepted consequence is a revoke latency of ≈ the refresh cadence — a character
// who left corp C still reads as a member until the next refresh flips the cached
// corp id (≤ ~1h via login/on-view; the nightly cron is the dormant-character
// backstop).

// One linked character's cached affiliation. `corporationId` is the only field
// the membership decision reads today; alliance/faction ride along for future
// consumers (the v4.0 mapper's alliance-level grants). `refreshedAt` is null
// until the first successful refresh.
export interface CachedAffiliation {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  refreshedAt: Date | null;
}

// Matches ESI's own `x-cached-seconds: 3600` on POST /characters/affiliation/ —
// there is no point refreshing (or trusting) affiliation more often than the
// upstream updates it. The single TTL governs the three refresh triggers AND the
// membership freshness gate, so revoke latency and refresh cadence stay aligned.
export const AFFILIATION_TTL_MS = 60 * 60 * 1000;

// A refresh is due when the affiliation was never read or is older than the TTL.
// Drives the on-view + cron stale gates and the gate's refresh-before-decide.
export function isAffiliationStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > AFFILIATION_TTL_MS;
}

// By corp, over a user's linked characters: the id of the FIRST character that is
// a CURRENT member of corporationId, or null if none is. Fail-closed — a matching
// corp whose affiliation is stale/null does not count (the cache can't be trusted
// to still say so). The id is the access-decision provenance the audited gate
// records (which pilot's affiliation granted access).
export function memberCharacterIdInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number | null {
  const match = affiliations.find(
    (a) => a.corporationId === corporationId && !isAffiliationStale(a.refreshedAt, now),
  );
  return match ? match.characterId : null;
}

// By corp, over a user's linked characters: the ids of ALL characters that are
// CURRENT members of corporationId (same fail-closed rule). The plural form of
// memberCharacterIdInCorp — for a role gate that must try every in-corp pilot (any
// one of which might hold the in-game role), not just the first.
export function memberCharacterIdsInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number[] {
  return affiliations
    .filter((a) => a.corporationId === corporationId && !isAffiliationStale(a.refreshedAt, now))
    .map((a) => a.characterId);
}

// Every corporation the user is a CURRENT member of, deduped — the read-scope set
// for shared per-corp data (3.7.9 owned structures): a member sees their corp's
// shared catalogue, a non-member's set never includes it. Same fail-closed rule as
// memberCharacterIdInCorp — a stale/null affiliation does not count.
export function memberCorpIds(affiliations: CachedAffiliation[], now: Date): number[] {
  const ids = new Set<number>();
  for (const a of affiliations) {
    if (a.corporationId !== null && !isAffiliationStale(a.refreshedAt, now)) {
      ids.add(a.corporationId);
    }
  }
  return [...ids];
}

// Is any linked character a CURRENT member of corporationId? The boolean form of
// memberCharacterIdInCorp — one source of truth for the fail-closed match rule.
export function isMemberOfCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): boolean {
  return memberCharacterIdInCorp(affiliations, corporationId, now) !== null;
}

// By character: the single-row form, same fail-closed rule.
export function characterIsInCorp(
  affiliation: CachedAffiliation | null,
  corporationId: number,
  now: Date,
): boolean {
  return (
    affiliation !== null &&
    affiliation.corporationId === corporationId &&
    !isAffiliationStale(affiliation.refreshedAt, now)
  );
}
