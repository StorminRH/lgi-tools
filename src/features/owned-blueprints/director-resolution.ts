// Corp director resolution (MIGRATE.0) — the PURE dedup that turns the user's
// per-character corp-role candidates into one subject per corporation. A Neon-
// native replacement for the Convex corpSync subject resolution (its
// mergeCorpSubject), built on the membership/affiliation primitives rather than
// importing corpSync (which stays on the live corp-jobs tracker). The impure
// parts — enumerating the user's member corps, vending each character's token,
// reading its in-game roles — are done by the caller and fed in as candidates.

// One candidate vend for a corporation: the corp, the character whose token reads
// its blueprints endpoint, that already-vended token, and whether the character
// holds the Director role the endpoint requires.
export interface CorpDirectorCandidate {
  corporationId: number;
  vendingCharacterId: number;
  accessToken: string;
  hasRole: boolean;
}

// One subject per corporation, preferring a role-holder as the vending character
// so the corp read succeeds first try (a 403 would waste error budget); the first
// role-holder wins, so the choice is stable across runs. A corp whose only
// candidates lack the role is still returned (hasRole=false) — the caller decides
// to skip it (the graceful needs-role path), keeping this function a faithful,
// side-effect-free port of corpSync's mergeCorpSubject.
export function dedupeCorpDirectors(candidates: CorpDirectorCandidate[]): CorpDirectorCandidate[] {
  const byCorp = new Map<number, CorpDirectorCandidate>();
  for (const candidate of candidates) {
    const existing = byCorp.get(candidate.corporationId);
    if (existing === undefined) {
      byCorp.set(candidate.corporationId, candidate);
      continue;
    }
    if (!existing.hasRole && candidate.hasRole) {
      byCorp.set(candidate.corporationId, candidate);
    }
  }
  return [...byCorp.values()];
}
