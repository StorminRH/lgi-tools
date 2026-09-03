'use client';

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

export interface OutboundArrowProviderProps {

  readonly drawnSystemIds: ReadonlySet<number>;

  readonly edges: readonly ChainEdge[];

  readonly neighboursOf: (systemId: number) => readonly number[];
  readonly children: ReactNode;
}

export function OutboundArrowProvider({
  drawnSystemIds,
  edges,
  neighboursOf,
  children,
}: OutboundArrowProviderProps) {
  const presence = useContext(MapPresenceContext)?.presence;

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

    return derived.size === 0 ? EMPTY_OUTBOUND_ARROWS : derived;
  }, [pilotKey, drawnSystemIds, edges, neighboursOf]);

  return <OutboundArrowContext value={arrows}>{children}</OutboundArrowContext>;

}
