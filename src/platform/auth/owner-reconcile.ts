import type { CharacterRole } from './types';

export interface ProofFacts {
  readonly jwtOwnerHash: string;
  readonly columnOwnerHash: string | null;
  /** `owner` claim decoded from the row's stored access token; null when nothing is derivable. */
  readonly tokenOwnerHash: string | null;
  readonly accountUserId: string;
  /** null on a plain sign-in */
  readonly linkingUserId: string | null;
}

export type ProofDecision =
  | { readonly kind: 'noop' }
  /** Cross-user link with no owner evidence on the row: neither merge nor purge, Better Auth refuses as before. */
  | { readonly kind: 'refuse-unverified' }
  | { readonly kind: 'backfill' }
  | { readonly kind: 'transfer' }
  | {
      readonly kind: 'merge';
      readonly linkingUserId: string;
      readonly otherUserId: string;
      readonly backfill: boolean;
    };

/**
 * Decides what a proven character means for the row it already has. A merge
 * needs owner evidence on the row (the column, or the owner claim of the
 * stored token) that equals the JWT owner, so proving one character can only
 * hand over an account the prover already owned when the row was written.
 */
export function classifyProof(facts: ProofFacts): ProofDecision {
  const linkingUserId =
    facts.linkingUserId !== facts.accountUserId ? facts.linkingUserId : null;
  const stored = facts.columnOwnerHash || facts.tokenOwnerHash || null;
  if (stored === null) return { kind: linkingUserId === null ? 'backfill' : 'refuse-unverified' };
  if (stored !== facts.jwtOwnerHash) return { kind: 'transfer' };
  const backfill = !facts.columnOwnerHash;
  if (linkingUserId !== null) {
    return { kind: 'merge', linkingUserId, otherUserId: facts.accountUserId, backfill };
  }
  return { kind: backfill ? 'backfill' : 'noop' };
}

export interface MergeCandidate {
  readonly id: string;
  readonly createdAt: Date;
  readonly role: CharacterRole;
}

/** The older user survives; equal timestamps fall back to the smaller id so every racer picks the same one. */
export function pickSurvivor(
  a: MergeCandidate,
  b: MergeCandidate,
): { survivor: MergeCandidate; source: MergeCandidate } {
  const byAge = a.createdAt.getTime() - b.createdAt.getTime();
  const aSurvives = byAge === 0 ? a.id < b.id : byAge < 0;
  return aSurvives ? { survivor: a, source: b } : { survivor: b, source: a };
}
