'use client';

// The localStorage "recently viewed" read as a hook (3.7.24) — extracted from
// the RecentlyViewed component so the dashboard coordinator owns the state the
// rank model reads. `null` means "not read yet" (the server render + first
// paint), so the static shell never reads the client store; an empty array
// means "read, nothing there". The read is deferred a tick via setTimeout(0) —
// the same lint-safe escape the cascade clock uses — so it stays clear of
// react-hooks/set-state-in-effect.
import { useEffect, useState } from 'react';
import { readRecentBlueprints, type RecentBlueprint } from './recent-blueprints';

/**
 * Encapsulates the recent blueprints subscription and state lifecycle; callers provide lookup keys
 * where required and render the returned state.
 */
export function useRecentBlueprints(): RecentBlueprint[] | null {
  const [recent, setRecent] = useState<RecentBlueprint[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setRecent(readRecentBlueprints()), 0);
    return () => clearTimeout(t);
  }, []);

  return recent;
}
