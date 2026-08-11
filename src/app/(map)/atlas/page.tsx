import type { Metadata } from 'next';
import { MapCanvas } from '@/mapper';

/**
 * The parent admin wall intentionally replaces this page for unauthorized
 * requests, so Next cannot validate the leaf in every staged render. Request-
 * time session work is separately bounded by `MapAccessGate`.
 */
export const instant = false;

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
