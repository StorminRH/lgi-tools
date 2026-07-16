// Pure owner-hash reconciliation decision (3.7.1.3). The EVE JWT `owner` claim
// (CharacterOwnerHash) is stable for one human across logins and changes only
// when the character is transferred to a different EVE account. We store it on
// the account row and compare it on every auth; this function decides what the
// comparison means. Kept pure (no DB, no imports) so it's exhaustively unit-
// testable on its own — the DB orchestration that acts on the verdict lives in
// owner-transfer.ts (reconcileCharacterOwner).

export type OwnerReconcileAction =
  // The common re-login: stored hash matches the JWT (same owner) — do nothing.
  | 'noop'
  // No stored hash yet (legacy pre-3.7.1.3 row, or a freshly-created row): record
  // it. NEVER purge on a missing stored value — an absent hash carries no proof
  // of a transfer.
  | 'backfill'
  // Stored hash differs from the JWT: a different human now controls this
  // character. Purge the prior owner's footprint and force a fresh re-consent.
  | 'purge';

// `jwtOwnerHash` is the `owner` claim off the verified JWT (optional — EVE should
// always send it for a CHARACTER token, but treat its absence as "no information":
// never act). `storedHash` is the value on the account row (NULL on legacy/fresh
// rows). An empty string is treated like NULL (defensive — never a false purge on
// an empty stored value).
export function classifyOwnerReconcile(
  storedHash: string | null,
  jwtOwnerHash: string | null | undefined,
): OwnerReconcileAction {
  if (!jwtOwnerHash) return 'noop';
  if (!storedHash) return 'backfill';
  return storedHash === jwtOwnerHash ? 'noop' : 'purge';
}
