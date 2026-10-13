'use client';

import { useCallback } from 'react';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { createRememberedRead, useRememberedResource } from './remembered-read';
import { deriveRoster, type BuildCharacter } from './run-as-state';

interface Roster {
  characterId: number;
  list: BuildCharacter[];
}

// The roster outlives the pages that show it, so portraits drawn once stay drawn.
const rosterMemory = createRememberedRead<Roster>();

/** The account's characters as the active pilot sees them. */
async function readRoster(characterId: number, signal: AbortSignal): Promise<Roster | null> {
  const res = await apiFetch(accountCharactersEndpoint, { cache: 'no-store', signal });
  if (res.ok) return { characterId, list: res.data.characters };
  // A failed refresh keeps the roster already drawn for this pilot; a first failure settles empty.
  return rosterMemory.get()?.characterId === characterId ? null : { characterId, list: [] };
}

export function useActiveCharacterId(): number | null {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session?.characterId ?? null;
}

export function useAccountCharacters(): BuildCharacter[] | null {
  const { session, loading } = useAuth();
  const characterId = session?.characterId ?? null;
  const read = useCallback(
    async (signal: AbortSignal) => (characterId === null ? null : readRoster(characterId, signal)),
    [characterId],
  );
  const fetched = useRememberedResource(rosterMemory, read, { enabled: characterId !== null });
  return deriveRoster({ loading, characterId }, fetched);
}
