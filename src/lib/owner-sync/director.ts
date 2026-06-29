import type { CorpDirectorResolution, CorpMemberCandidate } from './types';

// Pick + classify a corporation's vended member candidates into one outcome. Prefer
// a role-holder as the vending character so the corp read succeeds first try (a 403
// would waste error budget); the FIRST role-holder wins, so the choice is stable
// across runs. This is the shared Neon-native replacement for the per-slice director
// resolvers (owned-blueprints / assets dedupeCorpDirectors + corp-jobs
// resolveCorpDirector), which produced identical observable outcomes — the simple
// slices collapse needs_role + unavailable to a skip (no saveGateState), corp jobs
// records the graceful needs_role state.
export function classifyCorpDirector(candidates: CorpMemberCandidate[]): CorpDirectorResolution {
  if (candidates.length === 0) return { kind: 'unavailable' };
  const roleHolder = candidates.find((candidate) => candidate.hasRole);
  if (roleHolder === undefined) return { kind: 'needs_role' };
  return {
    kind: 'token',
    vendingCharacterId: roleHolder.vendingCharacterId,
    accessToken: roleHolder.accessToken,
  };
}
