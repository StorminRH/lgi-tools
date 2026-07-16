import type { ActiveCharacter } from './linked-characters';
import type { CharacterRole } from './types';

// Shape the enriched session identity from an already-resolved active character.
//
// This is the pure core of the customSession enrichment (auth.ts): given the
// Better Auth `user`/`session`, the resolved active character (the one named by
// user.activeCharacterId, or the oldest linked account — resolved by the caller
// with the one indexed DB read), and an admin predicate, derive the legacy-shaped
// identity fields the server shim (session.ts) and the client (useSession) read.
// Name/portrait fall back to the user row only when the character's profile row
// hasn't been written yet, so the header portrait/name always match the active
// selection independent of `overrideUserInfo` churn.
//
// `isAdmin` is injected because the real check reads a superadmin env var — keeping
// it out of here leaves this branch-free-enough to test without any environment.
export function deriveSessionIdentity<
  U extends { role?: unknown; name: string; image?: string | null },
  S,
>(params: {
  user: U;
  session: S;
  active: ActiveCharacter | null;
  isAdmin: (characterId: number | null, role: CharacterRole) => boolean;
}) {
  const { user, session, active, isAdmin } = params;
  const role = (user.role as CharacterRole) ?? 'USER';
  const characterId = active?.characterId ?? null;
  return {
    user,
    session,
    characterId,
    name: active?.name ?? user.name,
    portraitUrl: active?.portraitUrl ?? user.image ?? '',
    role,
    isAdmin: isAdmin(characterId, role),
  };
}
