/**
 * EVE SSO returns no email, but Better Auth's `user.email` is NOT NULL + UNIQUE.
 * Mint a deterministic, never-deliverable address per character — the `.invalid`
 * TLD is reserved by RFC 2606 specifically so it can never resolve, signalling
 * "no real inbox" rather than squatting a plausible domain. Defined once and
 * shared by the auth config (new logins) and the backfill (existing pilots) so
 * both write byte-identical addresses for the same character.
 */
export function syntheticEmail(characterId: number): string {
  return `${characterId}@eve.invalid`;
}
