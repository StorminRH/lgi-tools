/**
 * The enriched Better Auth session that `auth.api.getSession` resolves after
 * `deriveSessionIdentity`, for route and session tests. Type each mock that
 * hands one back, e.g. `vi.fn<() => Promise<BetterAuthSession | null>>()`, so a
 * change to the session shape fails type-checking instead of drifting.
 */
import type { BetterAuthSession } from '@/composition/route-guards';

type SessionIdentity = Omit<BetterAuthSession, 'user' | 'session'>;

const ISSUED_AT = '2026-01-01T00:00:00.000Z';
const EXPIRES_AT = '2026-01-31T00:00:00.000Z';

/**
 * A signed-in USER (`eve-user-1`, character 100, Alice). The `user` record
 * follows the identity's name, role and character unless overridden, and the
 * `session` record always belongs to `user.id`.
 */
export function sessionFixture({
  user: userOverrides,
  ...identityOverrides
}: Partial<Omit<BetterAuthSession, 'user' | 'session'>> & {
  user?: Partial<BetterAuthSession['user']>;
} = {}): BetterAuthSession {
  const identity: SessionIdentity = {
    characterId: 100,
    name: 'Alice',
    portraitUrl: 'a',
    role: 'USER',
    isAdmin: false,
    ...identityOverrides,
  };
  const userId = userOverrides?.id ?? 'eve-user-1';
  const issuedAt = new Date(ISSUED_AT);
  return {
    user: {
      id: userId,
      name: identity.name,
      email: `${userId}@eve.invalid`,
      emailVerified: true,
      image: null,
      createdAt: issuedAt,
      updatedAt: issuedAt,
      role: identity.role,
      activeCharacterId: identity.characterId,
      ...userOverrides,
    },
    session: {
      id: `session-${userId}`,
      token: `token-${userId}`,
      userId,
      expiresAt: new Date(EXPIRES_AT),
      createdAt: issuedAt,
      updatedAt: issuedAt,
    },
    ...identity,
  };
}

/** {@link sessionFixture} with role ADMIN and isAdmin true. */
export function adminSessionFixture(
  overrides: Parameters<typeof sessionFixture>[0] = {},
): BetterAuthSession {
  return sessionFixture({ role: 'ADMIN', isAdmin: true, ...overrides });
}
