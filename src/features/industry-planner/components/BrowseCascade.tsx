'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CascadingPanels, type CascadePane } from '@/components/ui/cascading-panels';
import { useCascadePath } from '@/components/ui/use-cascade-path';
import { CascadeContext, type CascadeNav } from './cascade-context';
import { InputColumn, InputColumnLoading } from './InputColumn';

// The discovery-browse cascade — the heaviest consumer of CascadingPanels +
// useCascadePath. Pane 0 is the server-rendered catalog (handed in as a node);
// each deeper pane is a blueprint's direct inputs, fetched on demand from
// /api/industry/inputs and read via Suspense (see InputColumn). The open path
// lives in `?browse=` via useCascadePath (pushState/popstate — NOT
// useSearchParams), so drilling is shareable + back-button-able and never
// re-renders the static shell. Browsing fetches structure/prices that are
// already cached server-side; it triggers no price refresh.
export function BrowseCascade({ catalog }: { catalog: ReactNode }) {
  const [path, setPath] = useCascadePath('browse');

  // One clock for every fanned column, set after hydration (never during the
  // static prerender / render — see CascadeNav.now).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  const openFrom = useCallback(
    (depth: number, blueprintId: number) => {
      const key = String(blueprintId);
      // Re-clicking the open id at this depth collapses back to it; otherwise
      // open it and drop anything deeper.
      setPath(path[depth] === key ? path.slice(0, depth) : [...path.slice(0, depth), key]);
    },
    [path, setPath],
  );

  const nav: CascadeNav = useMemo(() => ({ path, openFrom, now }), [path, openFrom, now]);

  const panes: CascadePane[] = [{ key: 'catalog', content: catalog }];
  path.forEach((id, i) => {
    panes.push({
      key: id,
      content: (
        <Suspense fallback={<InputColumnLoading />}>
          <InputColumn blueprintId={Number(id)} writeDepth={i + 1} />
        </Suspense>
      ),
    });
  });

  return (
    <CascadeContext.Provider value={nav}>
      <CascadingPanels panes={panes} className="mt-1" />
    </CascadeContext.Provider>
  );
}
