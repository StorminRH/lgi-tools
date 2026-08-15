import type { Session } from '../types';

/** Client authentication context: session, admin flag, and loading hold. */
export interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
}

/** Slice of Better Auth `useSession().data` that the client snapshot reads. */
type AuthSessionData = {
  characterId: number | null;
  name: string;
  portraitUrl: string;
  role: Session['role'];
  isAdmin: boolean;
} | null;

const HELD: AuthState = { session: null, isAdmin: false, loading: true };
const SIGNED_OUT: AuthState = { session: null, isAdmin: false, loading: false };

/**
 * Publishes a session only after the hydration hold has released and Better
 * Auth is no longer pending. Callers that branch on `session` alone therefore
 * cannot paint a different first tree than the server.
 */
export function resolveAuthState(
  released: boolean,
  data: AuthSessionData,
  isPending: boolean,
): AuthState {
  if (!released || isPending) return HELD;
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
