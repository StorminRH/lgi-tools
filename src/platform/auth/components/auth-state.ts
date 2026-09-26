import type { Session } from '../types';

export interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
}

export type AuthSessionData = {
  characterId: number | null;
  name: string;
  portraitUrl: string;
  role: Session['role'];
  isAdmin: boolean;
} | null;

const HELD: AuthState = { session: null, isAdmin: false, loading: true };
const SIGNED_OUT: AuthState = { session: null, isAdmin: false, loading: false };

/**
 * `settled` is true once this tab has resolved a session. After that,
 * better-auth reports pending again only while a signed-out session refetches
 * (window focus, reconnect), so the signed-out answer stands instead of
 * flashing every session-gated slot back to its loading state.
 */
export function resolveAuthState(
  released: boolean,
  data: AuthSessionData,
  isPending: boolean,
  settled = false,
): AuthState {
  if (!released || (isPending && !settled)) return HELD;
  if (data == null || data.characterId == null) return SIGNED_OUT;
  return {
    session: {
      characterId: data.characterId,
      name: data.name,
      portraitUrl: data.portraitUrl,
      role: data.role,
    },
    isAdmin: data.isAdmin,
    loading: false,
  };
}
