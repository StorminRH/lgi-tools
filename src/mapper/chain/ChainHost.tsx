'use client';

import type { Edge } from '@xyflow/react';
import { useConvexAuthed } from '@/data/convex/use-convex-authed';
import { ChainSurface } from '../canvas/ChainSurface';
import type { ChainNode } from '../canvas/SystemNode';
import { ChainLive } from './ChainLive';

const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

export function ChainHost({ mapId }: { readonly mapId: string }) {
  const authed = useConvexAuthed();

  if (!authed) return <ChainSurface nodes={EMPTY_NODES} edges={EMPTY_EDGES} />;
  return <ChainLive mapId={mapId} />;
}
