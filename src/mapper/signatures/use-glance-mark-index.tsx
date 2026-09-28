'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/data/convex/api';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import type { SigGroup } from '@/data/maps/scan-parse';
import {
  glanceMarkIndex,
  sameGlanceMarkIndex,
  type GlanceBucket,
} from './signature-model';

const GLANCE_PAGE_SIZE = 100;

const NO_MARKS: readonly GlanceBucket[] = [];

const GlanceMarkIndexContext = createContext<ReadonlyMap<
  number,
  readonly GlanceBucket[]
> | null>(null);

export function GlanceMarkIndexProvider({
  mapId,
  children,
}: {
  readonly mapId: string;
  readonly children?: ReactNode;
}) {
  const pages = useDrainedPages(
    api.mapScan.watchMapGlanceGroups,
    { mapId },
    GLANCE_PAGE_SIZE,
  );
  const next = useMemo(
    () =>
      glanceMarkIndex(
        pages.rows.map((row) => ({
          systemId: row.systemId,
          group: row.group as SigGroup,
        })),
      ),
    [pages.rows],
  );
  const [index, setIndex] = useState(next);
  if (index !== next && !sameGlanceMarkIndex(index, next)) setIndex(next);
  return (
    <GlanceMarkIndexContext.Provider value={index}>
      {children}
    </GlanceMarkIndexContext.Provider>
  );
}

export function useGlanceMarks(systemId: number): readonly GlanceBucket[] {
  const index = useContext(GlanceMarkIndexContext);
  return index?.get(systemId) ?? NO_MARKS;
}
