'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SiteSearchEntry } from './queries';
import {
  createSiteNameLookups,
  type SiteCatalogueLookups,
} from './site-name-lookup';

/** Outside a provider, no scanner name resolves to a catalogue site. */
const NO_SITE_CATALOGUE = createSiteNameLookups([]);

/**
 * The site index is request-scoped server data that the first (server)
 * render must already resolve, or the Est. ISK cells flash on hydration.
 * That is why it is a context and not a client store, whose server value
 * is one module constant.
 */
const SiteCatalogueContext = createContext<SiteCatalogueLookups>(NO_SITE_CATALOGUE);

export function SiteCatalogueProvider({
  siteIndex,
  children = null,
}: {
  readonly siteIndex: readonly SiteSearchEntry[];
  readonly children?: ReactNode;
}) {
  const lookups = useMemo(() => createSiteNameLookups(siteIndex), [siteIndex]);
  return (
    <SiteCatalogueContext.Provider value={lookups}>
      {children}
    </SiteCatalogueContext.Provider>
  );
}

export function useSiteCatalogue(): SiteCatalogueLookups {
  return useContext(SiteCatalogueContext);
}
