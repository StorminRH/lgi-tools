import type { Metadata } from 'next';
import { MapCanvas } from '@/mapper';

/** Administrator-only living-map surface metadata; robots keep the wall out of indexes. */
export const metadata: Metadata = {
  title: 'Atlas',
  robots: { index: false },
};

/**
 * Administrator-only living-map surface. The group layout owns the wall and
 * floating chrome; this page mounts the empty React Flow canvas.
 */
export default function AtlasPage() {
  return <MapCanvas />;
}
