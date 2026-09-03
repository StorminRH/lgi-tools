import { headers } from 'next/headers';
import { readEnv } from '@/lib/env';
import { auth } from '@/composition/auth';
import type { Session } from '@/platform/auth/types';

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

export async function getSessionCharacterId(): Promise<number | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.characterId ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.user?.id ?? null;
}

export function isAdmin(session: Session | null): boolean {
  if (!session) return false;
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  return session.characterId === superId || session.role === 'ADMIN';
}
