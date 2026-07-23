'use client';

// The account's linked characters for the CURRENT auth identity — the Run-As
// selector's roster. Lives in the shared zone because it reads the auth session
// (a feature may not import auth/components; it may import this hook). The fetch
// re-keys on the active characterId, so a planner mounted signed-out picks the
// roster up when the session lands, and an active-character switch refetches —
// the Greptile #196 stale-roster finding. State is only ever set from the fetch
// callback and keyed by the identity it was fetched FOR (the query-keyed,
// sync-setState-free shape); a failed read settles as [] so a saved pick fails
// open to the mirror instead of loading forever. The pure derivation
// (deriveRoster) is unit-tested; this shell stays fetch-only.
import { useEffect, useState } from 'react';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { deriveRoster, type BuildCharacter } from './run-as-state';

/**
 * Encapsulates the account characters subscription and state lifecycle; callers provide lookup
 * keys where required and render the returned state.
 */
export function useAccountCharacters(): BuildCharacter[] | null {
  const { session, loading } = useAuth();
  const characterId = session?.characterId ?? null;
  const [fetched, setFetched] = useState<{
    characterId: number;
    list: BuildCharacter[];
  } | null>(null);

  useEffect(() => {
    if (characterId === null) return; // anon derives [] below; nothing to fetch
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
