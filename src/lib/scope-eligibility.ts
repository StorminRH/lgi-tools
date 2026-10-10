import type { EveScope } from '@/config/eve-scopes';

/**
 * What a sync reads off a linked character to decide whether it may run: a
 * refresh token, and the EVE_SCOPES its stored grant lacks.
 */
export interface ScopeHolder {
  readonly hasRefreshToken: boolean;
  readonly missingScopes: readonly string[];
}

export type ScopeEligibility = (holder: ScopeHolder) => boolean;

/** A refresh token and none of `scopes` missing; with no scopes, the token alone. */
export function hasScopes(holder: ScopeHolder, scopes: readonly EveScope[]): boolean {
  return holder.hasRefreshToken && !scopes.some((scope) => holder.missingScopes.includes(scope));
}

/** {@link hasScopes} bound to one sync's scope set. */
export function scopeEligibility(scopes: readonly EveScope[]): ScopeEligibility {
  return (holder) => hasScopes(holder, scopes);
}
