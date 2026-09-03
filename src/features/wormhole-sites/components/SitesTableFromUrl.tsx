import type { SiteDetail } from '../types';
import { parseSortDir, parseSortKey } from '../sort';
import { SitesTable } from './SitesTable';

export type SitesSearchParams = {
  sort?: string | string[];
  dir?: string | string[];
};

function scalarParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function SitesTableFromUrl({
  sites,
  searchParams,
}: {
  sites: SiteDetail[];
  searchParams: Promise<SitesSearchParams>;
}) {
  const raw = await searchParams;
  const sortKey = parseSortKey(scalarParam(raw.sort));
  const sortDir = parseSortDir(scalarParam(raw.dir));

  return (
    <SitesTable
      sites={sites}
      sortKey={sortKey}
      sortDir={sortDir}
      currentParams={{ sort: sortKey ?? undefined, dir: sortKey ? sortDir : undefined }}
    />
  );
}
