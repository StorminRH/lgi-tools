// Session helper — the identity + authz primitives every feature routes through.
//
// Since 3.4.1a this is a thin shim over Better Auth: getSession() reads the
// session via auth.api.getSession() and reshapes the customSession enrichment
// into the legacy Session contract, so every existing caller is unchanged.
// isAdmin() keeps its exact signature and logic — it works because the Session
// still carries the active characterId and the (now per-user) role.

import { headers } from 'next/headers';
import { auth } from './auth';
import type { Session } from './types';

// THE identity primitive. Every feature that needs "who is calling?" goes
// through this one function. Returns null when logged out, the active
// character's identity (resolved through the user's linked EVE account) when
// logged in.
export async function getSession(): Promise<Session | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result || result.characterId == null) return null;
  return {
    characterId: result.characterId,
    name: result.name,
    portraitUrl: result.portraitUrl,
    role: result.role,
  };
}

// Lightweight identity for hot paths that only need "who is calling?" by id.
// Used by the high-volume telemetry beacon. Under Better Auth the character id
// lives on the account row (not the cookie), so this costs one indexed lookup
// rather than the old zero-DB cookie decode — acceptable because the beacon is
// fire-and-forget, off the response's critical path.
export async function getSessionCharacterId(): Promise<number | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.characterId ?? null;
}

// THE authz primitive — paired with getSession() as identity. Every "can this
// user touch X?" gate routes through here. Pure: takes a session + env, no DB
// or next/headers. Two paths grant admin: env-driven superadmin (Number()
// returns NaN for unset/garbage env, which never equals a real characterId)
// or DB-driven ADMIN role (now per-user, mutated via the /admin dashboard).
export function isAdmin(session: Session | null): boolean {
  if (!session) return false;
  const superId = Number(process.env.SUPERADMIN_CHARACTER_ID);
  return session.characterId === superId || session.role === 'ADMIN';
}
