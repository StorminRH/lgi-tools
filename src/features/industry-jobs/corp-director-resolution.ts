// Corp director resolution (MIGRATE.B.3) — the PURE pick-and-classify that turns a
// corporation's per-member token candidates into one outcome for the corp-jobs read.
// A Neon-native replacement for the Convex corp subject resolution (corpSync's
// mergeCorpSubject), built on the membership/affiliation primitives the caller feeds
// in (vend + roles read are impure and done in corp-refresh.ts). Mirrors the
// owned-blueprints/assets director pattern, but returns a TAGGED outcome rather than a
// nullable token: corp jobs must distinguish "no role-holder" (the graceful per-corp
// needs_role surface) from "couldn't vend any member this run" (transient — retry),
// which a plain string|null collapses.

// One vended member candidate for a corporation: the character whose token would read
// the corp endpoint, that already-vended token, and whether it holds a required
// in-game role (computed by the caller against CORP_INDUSTRY_JOBS_REQUIRED_ROLES).
export interface CorpMemberCandidate {
  vendingCharacterId: number;
  accessToken: string;
  hasRole: boolean;
}

// The resolution outcome for one corporation:
//   - token       — a role-holder's token to read the corp board with;
//   - needs_role  — members vended but NONE holds the role (granting scope can't fix
//                   it; the board surfaces the graceful "Role needed" state);
//   - unavailable — no member could be vended this run (transient: reauth/unlinked) —
//                   skip without recording a state, so the next view retries.
export type CorpDirectorResolution =
  | { kind: 'token'; vendingCharacterId: number; accessToken: string }
  | { kind: 'needs_role' }
  | { kind: 'unavailable' };

// Prefer a role-holder as the vending character so the corp read succeeds first try
// (a 403 would waste error budget); the first role-holder wins, so the choice is
// stable across runs.
export function resolveCorpDirector(candidates: CorpMemberCandidate[]): CorpDirectorResolution {
  if (candidates.length === 0) return { kind: 'unavailable' };
  const roleHolder = candidates.find((candidate) => candidate.hasRole);
  if (roleHolder === undefined) return { kind: 'needs_role' };
  return {
    kind: 'token',
    vendingCharacterId: roleHolder.vendingCharacterId,
    accessToken: roleHolder.accessToken,
  };
}
