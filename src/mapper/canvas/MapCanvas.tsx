'use client';

import type { Edge } from '@xyflow/react';
import { useSearchParams } from 'next/navigation';
import { convexClient } from '@/data/convex/client';
import { ChainHost } from '../chain/ChainHost';
import { ChainSurface } from './ChainSurface';
import type { ChainNode } from './SystemNode';

const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

/**
 * Renders the map's full-viewport React Flow surface, live when a map is addressed.
 *
 * The map id is read CLIENT-side from the query string (contract HC-3): the `/atlas` route stays
 * static, no server-side `preloadQuery` is introduced, and `useSearchParams` sits under the map
 * layout's existing Suspense boundary so the route classification is unchanged.
 *
 * Two gates decide whether the live layer mounts at all:
 *   - No `map` param → today's empty canvas; no subscription is opened.
 *   - No Convex deployment (`convexClient === null`, a contributor without Convex) → the empty
 *     canvas again. This gate is REQUIRED and the hooks' `'skip'` token is not a substitute: with
 *     `NEXT_PUBLIC_CONVEX_URL` unset there is no provider above, and the installed hooks throw even
 *     when skipped.
 *
 * The host is keyed by map id, so switching maps discards the previous map's reconciled nodes and
 * local placements instead of carrying them over, and re-subscribes fresh.
 *
 * There is no error boundary here. Losing access is a live value the host renders as a calm state, so
 * nothing in this path throws; a genuinely unexpected error belongs to the map route's own
 * `error.tsx`, and a boundary that could only rethrow to it would be a pass-through layer.
 */
export function MapCanvas() {
  const mapId = useSearchParams().get('map');

  return (
    <div data-map-canvas className="h-full w-full">
      {mapId !== null && convexClient !== null ? (
        <ChainHost key={mapId} mapId={mapId} />
      ) : (
        <ChainSurface nodes={EMPTY_NODES} edges={EMPTY_EDGES} />
      )}
    </div>
  );
}
