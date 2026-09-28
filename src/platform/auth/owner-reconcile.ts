import type { CharacterRole } from './types';

export interface ProofFacts {
  readonly jwtOwnerHash: string;
  readonly columnOwnerHash: string | null;
  readonly tokenOwnerHash: string | null;
  readonly accountUserId: string;
  readonly linkingUserId: string | null;
}

export type ProofDecision =
  | { readonly kind: 'noop' }
  | { readonly kind: 'refuse-unverified' }
  | { readonly kind: 'backfill' }
  | { readonly kind: 'transfer' }
  | {
      readonly kind: 'merge';
      readonly linkingUserId: string;
      readonly otherUserId: string;
      readonly backfill: boolean;
    };

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

export function pickSurvivor(
  a: MergeCandidate,
  b: MergeCandidate,
): { survivor: MergeCandidate; source: MergeCandidate } {
  const byAge = a.createdAt.getTime() - b.createdAt.getTime();
  const aSurvives = byAge === 0 ? a.id < b.id : byAge < 0;
  return aSurvives ? { survivor: a, source: b } : { survivor: b, source: a };
}
