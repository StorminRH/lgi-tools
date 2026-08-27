'use client';

import type { Edge } from '@xyflow/react';
import { useConvexAuthed } from '@/data/convex/use-convex-authed';
import { ChainSurface } from '../canvas/ChainSurface';
import type { ChainNode } from '../canvas/SystemNode';
import { ChainLive } from './ChainLive';

const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

/**
 * Renders the live chain, waiting for a Convex identity before subscribing.
 *
 * This gate is load-bearing and its purpose is easy to mistake. The websocket connects before Better
 * Auth has minted the JWT, and `watchMapAccess` answers an identity-less caller with
 * `{ granted: false }` — a legitimate value, not an error. Subscribing during that window would
 * therefore flash "You've lost access to this map" on every single map open, as a false revocation.
 * Removing this gate does not restore an error; it manufactures a wrong state.
 *
 * Waiting is also the correct HC-5 behavior: the canvas renders straight away and empty, with no
 * spinner, and nodes arrive when both the identity and the pages do.
 */
export function ChainHost({ mapId }: { readonly mapId: string }) {
  const authed = useConvexAuthed();

  if (!authed) return <ChainSurface nodes={EMPTY_NODES} edges={EMPTY_EDGES} />;
  return <ChainLive mapId={mapId} />;
}
