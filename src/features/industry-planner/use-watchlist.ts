'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecentBlueprint } from './recent-blueprints';
import { readWatchlist, toggleWatched, writeWatchlist } from './watchlist';

export function useWatchlist(): {
  watchlist: RecentBlueprint[] | null;
  toggle: (entry: RecentBlueprint) => void;
} {
  const [watchlist, setWatchlist] = useState<RecentBlueprint[] | null>(null);

  // Storage is read after hydration so the server and first client render agree.
  useEffect(() => {
    const t = setTimeout(() => setWatchlist(readWatchlist()), 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = useCallback((entry: RecentBlueprint) => {
    const next = toggleWatched(readWatchlist(), entry);
    writeWatchlist(next);
    setWatchlist(next);
  }, []);

  return { watchlist, toggle };
}
