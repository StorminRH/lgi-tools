'use client';

import { useCallback, useEffect } from 'react';
import { createClientStore, useClientStore } from '@/lib/client-store';
import type { RecentBlueprint } from './recent-blueprints';
import { readWatchlist, toggleWatched, writeWatchlist } from './watchlist';

// One store for the page, so the tab strip's count follows the research board.
const watchlistStore = createClientStore<RecentBlueprint[] | null>(null);

export function useWatchlist(): {
  watchlist: RecentBlueprint[] | null;
  toggle: (entry: RecentBlueprint) => void;
} {
  const watchlist = useClientStore(watchlistStore);

  // Storage is read after hydration so the server and first client render agree.
  useEffect(() => {
    const t = setTimeout(() => {
      if (watchlistStore.get() === null) watchlistStore.set(readWatchlist());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = useCallback((entry: RecentBlueprint) => {
    const next = toggleWatched(readWatchlist(), entry);
    writeWatchlist(next);
    watchlistStore.set(next);
  }, []);

  return { watchlist, toggle };
}
