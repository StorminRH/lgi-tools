'use client';

// Derives which rendered edges carry outbound pilot arrows (4.0.4.2.3 OW3)
// and publishes them for the edge renderer. Reads the presence context above
// it and pure inputs from the chain host; everything it computes is derived
// presentation — nothing is written anywhere (HC-1).
import { useContext, useMemo, type ReactNode } from 'react';
import type { ChainEdge } from '../chain/nodes';
import {
  EMPTY_OUTBOUND_ARROWS,
  OutboundArrowContext,
} from './outbound-arrow-context';
import { MapPresenceContext } from './presence-context';
import {
  arrowPilotKey,
  deriveOutboundArrows,
  edgeIdOfPairIndex,
  parseArrowPilotKey,
} from './pilot-path';

/** What the arrow derivation consumes from the chain host. */
export interface OutboundArrowProviderProps {
  /** The non-fogged rendered set: authored systems plus drawn halo rings. */
  readonly drawnSystemIds: ReadonlySet<number>;
  /** The rendered edge list (authored connections plus halo gate links). */
  readonly edges: readonly ChainEdge[];
  /** Sorted gate neighbours from the static asset; empty until it loads. */
  readonly neighboursOf: (systemId: number) => readonly number[];
  readonly children: ReactNode;
}

/** Publishes the per-edge outbound-arrow mounts for tracked off-map pilots. */
export function OutboundArrowProvider({
  drawnSystemIds,
  edges,
  neighboursOf,
  children,
}: OutboundArrowProviderProps) {
  const presence = useContext(MapPresenceContext)?.presence;
  // Content key: arrows depend only on which systems hold a covered pilot.
  // The bounded scan re-runs only when that membership (or the canvas) changes.
  const pilotKey = useMemo(() => {
    if (presence === undefined || presence.size === 0) return '';
    return arrowPilotKey(
      [...presence.entries()]
        .map(([systemId]) => ({
          systemId,
          live: true,
        }))
        .sort((left, right) => left.systemId - right.systemId),
    );
  }, [presence]);
  const arrows = useMemo(() => {
    if (pilotKey === '') return EMPTY_OUTBOUND_ARROWS;
    const derived = deriveOutboundArrows({
      pilotSystems: parseArrowPilotKey(pilotKey),
      drawnSystemIds,
      neighbours: neighboursOf,
      edgeIdOfPair: edgeIdOfPairIndex(edges),
    });
    // The empty constant keeps the context value identity-stable across the
    // provider's 30-second staleness ticks, so edges skip re-rendering.
    return derived.size === 0 ? EMPTY_OUTBOUND_ARROWS : derived;
  }, [pilotKey, drawnSystemIds, edges, neighboursOf]);

  return <OutboundArrowContext value={arrows}>{children}</OutboundArrowContext>;
}
