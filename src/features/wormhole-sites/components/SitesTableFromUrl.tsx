'use client';

import { useSearchParams } from 'next/navigation';
import type { SiteDetail } from '../types';
import { parseSortDir, parseSortKey } from '../sort';
import { SitesTable } from './SitesTable';

/** Resolves the catalogue table's small URL-backed sort hole around an otherwise cached dataset. */
export function SitesTableFromUrl({ sites }: { sites: SiteDetail[] }) {
  const searchParams = useSearchParams();
  const sortKey = parseSortKey(searchParams.get('sort') ?? undefined);
  const sortDir = parseSortDir(searchParams.get('dir') ?? undefined);

  return (
    <SitesTable
      sites={sites}
      sortKey={sortKey}
      sortDir={sortDir}
      currentParams={{ sort: sortKey ?? undefined, dir: sortKey ? sortDir : undefined }}
    />
  );
}
