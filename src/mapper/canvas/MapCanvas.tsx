'use client';

import type { Edge } from '@xyflow/react';
import { useSearchParams } from 'next/navigation';
import { convexClient } from '@/data/convex/client';
import { ChainHost } from '../chain/ChainHost';
import { ChainSurface } from './ChainSurface';
import type { ChainNode } from './SystemNode';

const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

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
