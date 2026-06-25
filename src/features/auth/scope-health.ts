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
// complete grant look incomplete.
function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? '').split(/[,\s]+/).filter((s) => s.length > 0));
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
