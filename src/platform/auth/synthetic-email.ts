import { parseLinkedAccountId } from './eve-account-shared';

const DOMAIN = '@eve.invalid';

/**
 * EVE SSO returns no email, but Better Auth's `user.email` is NOT NULL + UNIQUE.
 * Mint a deterministic, never-deliverable address per character — the `.invalid`
 * TLD is reserved by RFC 2606 specifically so it can never resolve, signalling
 * "no real inbox" rather than squatting a plausible domain. Defined once and
 * shared by the auth config (new logins) and the backfill (existing pilots) so
 * both write byte-identical addresses for the same character.
 */
export function syntheticEmail(characterId: number): string {
  return `${characterId}${DOMAIN}`;
}

/** The character a synthetic email names, or null for any other address, a placeholder included. */
export function syntheticEmailCharacterId(email: string): number | null {
  return email.endsWith(DOMAIN) ? parseLinkedAccountId(email.slice(0, -DOMAIN.length)) : null;
}

/**
 * The email for a user whose synthetic email named a character it lost, when
 * no free replacement exists. It is unique per user and never
 * `<digits>@eve.invalid`, so no EVE sign-in can match it. Migration 0083
 * parks stale users on the same address.
 */
export function unlinkedEmail(userId: string): string {
  return `unlinked-${userId}${DOMAIN}`;
}
