'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api } from '@/data/convex/api';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import type { SigGroup } from '@/data/maps/scan-parse';
import {
  glanceMarkIndex,
  type GlanceBucket,
} from './signature-model';

const GLANCE_PAGE_SIZE = 100;

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
    api.mapScan.watchMapGlanceMarks,
    { mapId },
    GLANCE_PAGE_SIZE,
  );
  const index = useMemo(
    () =>
      glanceMarkIndex(
        pages.rows.map((row) => ({
          systemId: row.systemId,
          group: row.group as SigGroup,
        })),
      ),
    [pages.rows],
  );
  return (
    <GlanceMarkIndexContext.Provider value={index}>
      {children}
    </GlanceMarkIndexContext.Provider>
  );
}

export function useGlanceMarks(systemId: number): readonly GlanceBucket[] {
  const index = useContext(GlanceMarkIndexContext);
  return index?.get(systemId) ?? [];
}
