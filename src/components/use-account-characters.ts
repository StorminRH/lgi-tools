'use client';

import { useEffect, useState } from 'react';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { deriveRoster, type BuildCharacter } from './run-as-state';

export function useActiveCharacterId(): number | null {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session?.characterId ?? null;
}

export function useAccountCharacters(): BuildCharacter[] | null {
  const { session, loading } = useAuth();
  const characterId = session?.characterId ?? null;
  const [fetched, setFetched] = useState<{
    characterId: number;
    list: BuildCharacter[];
  } | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let ignore = false;
    const controller = new AbortController();
    apiFetch(accountCharactersEndpoint, { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (ignore) return;
        setFetched({ characterId, list: res.ok ? res.data.characters : [] });
      })
      .catch(() => {
        if (ignore) return;
        setFetched({ characterId, list: [] });
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [characterId]);

  return deriveRoster({ loading, characterId }, fetched);
}
