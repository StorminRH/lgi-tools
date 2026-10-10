'use client';

import { useContext, useMemo, type ReactNode } from 'react';
import type { Neighbours } from '@/lib/graph';
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

export interface OutboundArrowProviderProps {
  readonly drawnSystemIds: ReadonlySet<number>;
  readonly edges: readonly ChainEdge[];
  readonly neighboursOf: Neighbours;
  readonly children: ReactNode;
}

export function OutboundArrowProvider({
  drawnSystemIds,
  edges,
  neighboursOf,
  children,
}: OutboundArrowProviderProps) {
  const presence = useContext(MapPresenceContext);
  const pilotKey = useMemo(() => {
    if (presence === null || presence.size === 0) return '';
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
    return derived.size === 0 ? EMPTY_OUTBOUND_ARROWS : derived;
  }, [pilotKey, drawnSystemIds, edges, neighboursOf]);

  return <OutboundArrowContext value={arrows}>{children}</OutboundArrowContext>;
}
