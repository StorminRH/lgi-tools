'use client';

import { useEffect } from 'react';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { useReadIdentity } from '@/platform/auth/read-identity';
import { createRememberedRead, useRememberedRead } from './remembered-read';
import { deriveRoster, type BuildCharacter } from './run-as-state';

// The roster outlives the pages that show it, so portraits drawn once stay drawn.
const rosterMemory = createRememberedRead<{ characterId: number; list: BuildCharacter[] }>();

export function useActiveCharacterId(): number | null {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session?.characterId ?? null;
}

export function useAccountCharacters(): BuildCharacter[] | null {
  const { session, loading } = useAuth();
  const characterId = session?.characterId ?? null;
  const identity = useReadIdentity();
  const fetched = useRememberedRead(rosterMemory);

  useEffect(() => {
    if (characterId === null || identity === null) return;
    let ignore = false;
    const controller = new AbortController();
    void apiFetch(accountCharactersEndpoint, { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (ignore) return;
        // A failed refresh keeps the roster already drawn.
        if (res.ok || rosterMemory.get()?.characterId !== characterId) {
          rosterMemory.set({ characterId, list: res.ok ? res.data.characters : [] }, identity);
        }
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [characterId, identity]);

  return deriveRoster({ loading, characterId }, fetched);
}
