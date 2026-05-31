'use client';

import { useCallback, useEffect, useState } from 'react';

// URL sync for a CascadingPanels open path. The path is a list of pane keys
// (the drill chain) carried in one comma-joined search param. Follows the
// `UrlSync` approach rather than `useSearchParams`: it reads
// `window.location.search` in a mount effect (so it stays out of the static
// shell prerender, which Cache Components would otherwise force dynamic) and
// writes with `history.pushState` (so each drill is a history entry the back
// button can walk). Other search params are preserved untouched.

export function useCascadePath(
  paramName: string,
): [string[], (path: string[]) => void] {
  const [path, setPathState] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      const raw = new URLSearchParams(window.location.search).get(paramName);
      setPathState(raw ? raw.split(',').filter(Boolean) : []);
    };
    read(); // restore the deep-drill path on load / shareable URLs
    window.addEventListener('popstate', read); // walk it on back/forward
    return () => window.removeEventListener('popstate', read);
  }, [paramName]);

  const setPath = useCallback(
    (next: string[]) => {
      setPathState(next);
      const params = new URLSearchParams(window.location.search);
      if (next.length) params.set(paramName, next.join(','));
      else params.delete(paramName);
      const qs = params.toString();
      window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname);
    },
    [paramName],
  );

  return [path, setPath];
}
