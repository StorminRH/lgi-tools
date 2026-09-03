import type { ActiveCharacter } from './linked-characters';
import type { CharacterRole } from './types';

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
