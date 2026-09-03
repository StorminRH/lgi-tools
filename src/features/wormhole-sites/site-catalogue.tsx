'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { SiteSearchEntry } from './queries';
import { setSiteSearchIndex } from './search';
import {
  siteEstIskForSiteName,
  siteIdForSiteName,
  siteLiveRecipesForSiteName,
  siteNameIndexKeys,
  type SiteLiveRecipe,
} from './site-name-lookup';
import { primarySiteIsk } from './site-primary-isk';

export type SiteCatalogueLookups = {
  readonly siteIdForName: (name: string) => number | null;
  readonly estIskForName: (name: string) => number | null;
  readonly liveRecipesForName: (name: string) => readonly SiteLiveRecipe[];
};

const MODULE_FALLBACK: SiteCatalogueLookups = {
  siteIdForName: siteIdForSiteName,
  estIskForName: siteEstIskForSiteName,
  liveRecipesForName: siteLiveRecipesForSiteName,
};

const SiteCatalogueContext = createContext<SiteCatalogueLookups | null>(null);

export function SiteCatalogueProvider({
  siteIndex,
  children = null,
}: {
  readonly siteIndex: readonly SiteSearchEntry[];
  readonly children?: ReactNode;
}) {
  const lookups = useMemo<SiteCatalogueLookups>(() => {
    const byName = new Map<string, SiteSearchEntry>();
    for (const entry of siteIndex) {
      for (const key of siteNameIndexKeys(entry.name)) {
        byName.set(key, entry);
      }
    }
    return {
      siteIdForName: (name) => byName.get(name)?.id ?? null,
      estIskForName: (name) => {
        const entry = byName.get(name);
        return entry === undefined ? null : primarySiteIsk(entry);
      },
      liveRecipesForName: (name) => byName.get(name)?.liveRecipes ?? [],
    };
  }, [siteIndex]);

  useLayoutEffect(() => {
    setSiteSearchIndex([...siteIndex]);
  }, [siteIndex]);

  return (
    <SiteCatalogueContext.Provider value={lookups}>
      {children}
    </SiteCatalogueContext.Provider>
  );
}

export function useSiteCatalogue(): SiteCatalogueLookups {
  return useContext(SiteCatalogueContext) ?? MODULE_FALLBACK;
}
