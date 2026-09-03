'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
} from '@/data/maps/access-contract';
import type {
  AuthorizedMapRow,
  DeletedRestorableMapRow,
} from '@/data/maps/queries';

export interface MapCatalogueData {
  readonly maps: readonly AuthorizedMapRow[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
  readonly listingAvailable: boolean;
}

const MapCatalogueDataContext = createContext<MapCatalogueData | null>(null);

export function MapCatalogueDataProvider({
  children = null,
  ...value
}: MapCatalogueData & { readonly children?: ReactNode }) {
  return (
    <MapCatalogueDataContext.Provider value={value}>
      {children}
    </MapCatalogueDataContext.Provider>

  );
}

export function useMapCatalogueData(): MapCatalogueData {
  const value = useContext(MapCatalogueDataContext);
  if (value === null) {
    throw new Error('Map catalogue data is unavailable outside MapCatalogueDataProvider.');
  }
  return value;
}
