// Scope health (3.4.2; per-feature deriver added 3.7.1.1). Pure: no DB, no
// network — given what's stored on a linked `account` row (its granted `scope`
// string and whether a usable refresh token survives) and a set of REQUIRED
// scopes, decide whether the pilot must reconnect to restore that access.
//
// Two layers:
//  - deriveScopeHealth(input, required) is the per-feature primitive: a feature
//    passes its own required-scope set so only that surface degrades. The set
//    lives in the feature's own slice (the feature⊥feature import is banned), so
//    the app layer composes the feature's set with this auth deriver.
//  - deriveCharacterHealth is the sitewide rollup — health against the full
//    requested superset (EVE_SCOPES). Drives the per-character "Reconnect"
//    affordance on /characters and the Convex sync flow's missing-scope signal.
//
// listGrantedScopes (3.7.1.4) is the read-only counterpart: it describes what a
// character has ACTUALLY granted (for the /characters transparency readout),
// rather than judging health against a required set.

import { EVE_SCOPES } from './eve-sso';

export interface CharacterHealth {
  // True when the character can't currently back the required ESI calls: either
  // its refresh token is gone (so nothing can be vended) or it's missing one of
  // the required scopes. Either way the fix is the same — re-link to re-consent,
  // which refreshes both tokens and scope.
  needsReconnect: boolean;
  // The required EVE scopes this character has NOT granted. Empty when complete.
  missingScopes: string[];
}

// Stored scope is comma-joined (Better Auth writes `tokens.scopes?.join(",")`),
// but EVE itself space-delimits — split on either so a format drift can't make a
// complete grant look incomplete. Ordered + deduped so the grant readout below
// is stable regardless of how the stored string happened to be ordered. This is
// the one place that knows the stored-scope string format.
function tokenizeScopes(scope: string | null | undefined): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of (scope ?? '').split(/[,\s]+/)) {
    if (raw.length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
  }
  return tokens;
}

function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set(tokenizeScopes(scope));
}

// Per-feature scope health: which of `required` a character is missing, and
// whether that surface should prompt a reconnect. Generic over `required` so
// each consumer (a feature surface, the sitewide rollup below) passes the exact
// set it needs — degradation stays scoped to that set, never global.
export function deriveScopeHealth(
  {
    scope,
    hasRefreshToken,
  }: {
    scope: string | null | undefined;
    hasRefreshToken: boolean;
  },
  required: readonly string[],
): CharacterHealth {
  const granted = parseScopes(scope);
  const missingScopes = required.filter((s) => !granted.has(s));
  return {
    needsReconnect: !hasRefreshToken || missingScopes.length > 0,
    missingScopes,
  };
}

// Sitewide rollup: health against the full requested superset (EVE_SCOPES).
export function deriveCharacterHealth(input: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): CharacterHealth {
  return deriveScopeHealth(input, EVE_SCOPES);
}

// A scope the character has actually granted, as shown read-only on /characters.
// `status` is 'active' when the scope is still in the requested set (EVE_SCOPES),
// or 'legacy' when it was granted earlier and is no longer requested (safe to
// revoke). `gloss` is a short human description when one is known.
export type GrantedScope = { id: string; gloss?: string; status: 'active' | 'legacy' };

// Short human descriptions for the scopes a pilot may have granted — the six
// currently requested plus the seven pruned in 3.7.1.1 that legacy grants still
// carry. Private: only listGrantedScopes reads it. An unglossed scope still
// renders (its raw id), so this map need not be exhaustive.
const SCOPE_GLOSS: Record<string, string> = {
  // Active — the current requested set (EVE_SCOPES).
  publicData: 'Read your public character info',
  'esi-skills.read_skills.v1': 'Read your trained skills',
  'esi-skills.read_skillqueue.v1': 'Read your skill queue',
  'esi-industry.read_character_jobs.v1': 'Read your industry jobs',
  'esi-characters.read_corporation_roles.v1': 'Read your corporation roles',
  'esi-industry.read_corporation_jobs.v1': "Read your corporation's industry jobs",
  // Legacy — pruned in 3.7.1.1, still present in older grants.
  'esi-planets.manage_planets.v1': 'Manage your planetary colonies',
  'esi-characters.read_standings.v1': 'Read your standings',
  'esi-clones.read_implants.v1': 'Read your active implants',
  'esi-clones.read_clones.v1': 'Read your jump clones',
  'esi-location.read_location.v1': 'Read your current location',
  'esi-location.read_online.v1': 'Read your online status',
  'esi-location.read_ship_type.v1': 'Read your current ship type',
};

function describeScope(id: string, status: 'active' | 'legacy'): GrantedScope {
  const gloss = SCOPE_GLOSS[id];
  return gloss ? { id, gloss, status } : { id, status };
}

// List what a character has ACTUALLY granted (parsed from the stored scope), not
// the ideal set — so a legacy grant honestly shows every scope it still carries.
// Active scopes (those still requested) come first in EVE_SCOPES order; legacy
// scopes (granted earlier, no longer requested) follow in grant order.
export function listGrantedScopes(scope: string | null | undefined): GrantedScope[] {
  const granted = tokenizeScopes(scope);
  const grantedSet = new Set(granted);
  const activeSet = new Set<string>(EVE_SCOPES);
  const active = EVE_SCOPES.filter((id) => grantedSet.has(id)).map((id) =>
    describeScope(id, 'active'),
  );
  const legacy = granted
    .filter((id) => !activeSet.has(id))
    .map((id) => describeScope(id, 'legacy'));
  return [...active, ...legacy];
}
