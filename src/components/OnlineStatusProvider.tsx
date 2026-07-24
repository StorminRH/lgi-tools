'use client';

// The viewer's live online-status feed (MIGRATE.A) — the keeper consumer of the
// presence-gated Convex engine. Mounted once in the root layout (inside the
// Convex provider): it subscribes ONCE to api.onlineStatus.forViewer and shares
// the per-character online flags through context, so every CharacterPortrait
// across the app reads one subscription rather than each wiring its own. A single
// heartbeat (gated on the Convex session) keeps the dataset refreshing while a
// tab is visible — auto on mount/visible + cadence, NO manual refresh (the
// live-surface invariant). The heartbeat hints only the ACTIVE character, but the
// sync action re-enumerates every linked character server-side, so the whole
// roster's online state is synced and exposed here.
//
// Other people's characters (corp jobmates, admin views, the maintainer) are
// never in this map, so their portraits read `undefined` → no dot. Signed out, or
// with no Convex deployment, the context is empty and no portrait shows a dot.
import { Authenticated, useQuery } from 'convex/react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { useAuth } from '@/platform/auth/components/AuthProvider';

// characterId → online (true/false). Absent = unknown (no live doc / not ours).
const OnlineStatusContext = createContext<ReadonlyMap<number, boolean>>(new Map());

/**
 * Read one character's live online flag. undefined when the character isn't the
 * viewer's, hasn't synced yet, or there's no provider above (the default map).
 */
export function useOnlineFlag(characterId: number): boolean | undefined {
  return useContext(OnlineStatusContext).get(characterId);
}

/**
 * Publishes online status state to descendants; the provider owns subscription and update
 * lifecycle while children consume it.
 */
export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  // No Convex deployment → no subscription; the default empty map means every
  // portrait reads `unknown` and shows no dot (consumers never crash).
  if (convexClient === null) return <>{children}</>;
  return <OnlineStatusSubscribed>{children}</OnlineStatusSubscribed>;
}

function OnlineStatusSubscribed({ children }: { children: ReactNode }) {
  const view = useQuery(api.onlineStatus.forViewer);
  const map = useMemo(() => {
    const next = new Map<number, boolean>();
    for (const c of view?.characters ?? []) next.set(c.characterId, c.online);
    return next;
  }, [view]);

  return (
    <OnlineStatusContext.Provider value={map}>
      <Authenticated>
        <OnlineStatusHeartbeat />
      </Authenticated>
      {children}
    </OnlineStatusContext.Provider>
  );
}

// Presence heartbeat, mounted only once the Convex session is established. The
// hint is just the active character — the sync action re-enumerates the user's
// full roster from Neon, so one hint bootstraps syncing every linked character.
function OnlineStatusHeartbeat() {
  const { session } = useAuth();
  useSyncSubject('onlineStatus', session ? [session.characterId] : []);
  return null;
}
