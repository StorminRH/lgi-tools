// Per-character token health (3.4.2). Pure: no DB, no network — given what's
// stored on a linked `account` row (its granted `scope` string and whether a
// usable refresh token survives), decide whether the pilot must reconnect the
// character to restore full ESI access. Drives the "Reconnect" affordance on the
// /characters page.

import { EVE_SCOPES } from './eve-sso';

export interface CharacterHealth {
  // True when the character can't currently back a full-access ESI call: either
  // its refresh token is gone (so nothing can be vended) or it's missing one of
  // the scopes the trackers need. Either way the fix is the same — re-link to
  // re-consent, which refreshes both tokens and scope.
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

export function deriveCharacterHealth({
  scope,
  hasRefreshToken,
}: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): CharacterHealth {
  const granted = parseScopes(scope);
  const missingScopes = EVE_SCOPES.filter((s) => !granted.has(s));
  return {
    needsReconnect: !hasRefreshToken || missingScopes.length > 0,
    missingScopes,
  };
}
