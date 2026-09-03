'use client';

import type { Doc, Id } from '@/data/convex/data-model';
import { DEFAULT_LAYOUT_CONFIG, type LayoutConfig } from '../layout/layout-contract';
import type { HaloLimits, PlacedHalo } from '../halo/halo-model';
import type { ConnectionDetail, UnresolvedHoleSummary } from './connection-detail';
import type { ChainPosition, MapChainIntent } from './intents';
import type { SystemLabel } from './labels';
import type { PlacedStub } from './nodes';
import type { ChainState } from './reconciler';
import type { MapAccessState } from './use-map-chain-pages';
import { useConnectionPresentationNow, useMapChainPages } from './use-map-chain-pages';
import { useMapChainHalo } from './use-map-chain-halo';
import { useMapChainMerge } from './use-map-chain-merge';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();

export interface MapChain {
  readonly access: MapAccessState;
  readonly canEdit: boolean | undefined;
  readonly systemsComplete: boolean;
  readonly liveSystemCount: number;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly events: readonly Doc<'mapEvents'>[];
  readonly connectionPresentationNow: number;
  readonly state: ChainState;
  readonly intents: readonly MapChainIntent[];
  readonly labelOf: (systemId: number) => SystemLabel;
  readonly treeParents: ReadonlyMap<number, number>;
  readonly rootSystemId: number | null;
  readonly halo: PlacedHalo;
  readonly stubs: readonly PlacedStub[];
  readonly neighboursOf: (systemId: number) => readonly number[];
  readonly pinPlacement: (systemId: number, position: ChainPosition) => void;
  readonly releasePlacements: () => void;
}

export function useMapChain(
  mapId: string | null,
  draggingIds: ReadonlySet<number> = EMPTY_DRAG_SET,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  haloLimits?: HaloLimits,
): MapChain {
  const pages = useMapChainPages(mapId);
  const connectionPresentationNow = useConnectionPresentationNow(pages.connections);
  const { halo, haloKey, labelOf, neighboursOf, stubKey } = useMapChainHalo(
    pages.authoredKey,
    pages.stubLayout,
    haloLimits,
  );
  const {
    merge,
    pinPlacement,
    placedHalo,
    releasePlacements,
    rootSystemId,
    stubs,
    treeParents,
  } = useMapChainMerge(
    pages.systems,
    pages.connections,
    pages.stubLayout,
    halo,
    haloKey,
    stubKey,
    draggingIds,
    config,
  );

  return {
    access: pages.access,
    canEdit: pages.canEdit,
    systemsComplete: pages.systems.complete,
    liveSystemCount: pages.systems.rows.length,
    connectionDetails: pages.connectionDetails,
    unresolvedHoles: pages.unresolvedHoles,
    events: pages.events,
    connectionPresentationNow,
    state: merge.state,
    intents: merge.intents,
    labelOf,
    treeParents,
    rootSystemId,
    halo: placedHalo,
    stubs,
    neighboursOf,
    pinPlacement,
    releasePlacements,
  };
}
