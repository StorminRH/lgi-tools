'use client';

import { useSearchParams } from 'next/navigation';
import { MapCatalogue } from '@/features/maps/MapCatalogue';
import { MapCanvas } from '@/mapper';

/** Selects the no-map catalogue or the unchanged addressed-map canvas by query presence. */
export function AtlasEntry() {
  const mapId = useSearchParams().get('map');
  return mapId === null ? <MapCatalogue /> : <MapCanvas />;
}
