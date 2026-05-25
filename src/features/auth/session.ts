// Session helper. Two strata in one file, top-to-bottom:
//   1. Pure JWE crypto (encryptSession / decryptSession) — no DB, no Next.js.
//   2. getSession() — reads the session cookie via next/headers and re-queries
//      the characters row so admin grants and preference updates take effect
//      without forcing a re-login.

import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './cookies';
import { getCharacterById } from './queries';
import type { Session, SessionPayload } from './types';

const ALG = 'dir';
const ENC = 'A256GCM';
const SESSION_EXPIRES = `${SESSION_MAX_AGE_SECONDS}s`;

let cachedKey: Uint8Array | undefined;
function sessionKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error('SESSION_SECRET is not set');
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.byteLength !== 32) {
    throw new Error(
      `SESSION_SECRET must be 32 bytes after base64url decode (got ${key.byteLength})`,
    );
  }
  cachedKey = new Uint8Array(key);
  return cachedKey;
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return await new EncryptJWT({ characterId: payload.characterId })
    .setProtectedHeader({ alg: ALG, enc: ENC })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRES)
    .encrypt(sessionKey());
}

// Returns null for any failure (missing, malformed, tampered, expired).
// We never throw out of session decode — callers can treat null as "logged out".
export async function decryptSession(jwe: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(jwe, sessionKey());
    if (typeof payload.characterId !== 'number') return null;
    return { characterId: payload.characterId };
  } catch {
    return null;
  }
}

// THE identity primitive. Every future feature that needs "who is calling?"
// goes through this one function. Returns null when logged out, the fresh
// character record when logged in.
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  if (!cookie) return null;

  const payload = await decryptSession(cookie.value);
  if (!payload) return null;

  const character = await getCharacterById(payload.characterId);
  if (!character) return null;

  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    role: character.role,
  };
}
