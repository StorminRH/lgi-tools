import type { Metadata } from 'next';
import { MapCanvas } from '@/mapper';

/** Static search and crawler metadata for the development-walled atlas route. */
export const metadata: Metadata = {
  title: 'Atlas — LGI.tools',
  robots: { index: false },
};

/**
 * Renders the empty atlas canvas supplied by the mapper host layer.
 */
export default function AtlasPage() {
  return <MapCanvas />;
}
