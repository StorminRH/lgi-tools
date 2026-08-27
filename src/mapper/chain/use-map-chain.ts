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
  /**
   * Live access. `false` means the calm no-access state; `undefined` means not yet known, which
   * renders the same empty canvas as an authorized empty map (HC-5 — never a loading state).
   */
  readonly access: MapAccessState;
  /**
   * Whether the same claim carries edit. `undefined` until access first answers;
   * then always a boolean (false when access is withdrawn).
   */
  readonly canEdit: boolean | undefined;
  /**
   * Whether every systems page has landed. Home prompt waits on this so an
   * editor never sees a false-empty prompt while pages are still draining.
   */
  readonly systemsComplete: boolean;
  /**
   * Live (non-tombstoned) system count from the filtered subscription pages —
   * not the async merged canvas state. Home prompt gates on this so a
   * populated map never flashes the empty-map prompt during the first layout.
   */
  readonly liveSystemCount: number;
  /** Live connection detail fields keyed by document id, for the authoring card. */
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  /** Live scanned-but-unexplored wormhole slots, for jump-resolution labeling. */
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  /** Shared newest-first despawn ledger rows for the mapper-local log surface. */
  readonly events: readonly Doc<'mapEvents'>[];
  /** Coarse client clock used only for dying-to-skeleton edge presentation. */
  readonly connectionPresentationNow: number;
  readonly state: ChainState;
  readonly intents: readonly MapChainIntent[];
  readonly labelOf: (systemId: number) => SystemLabel;
  readonly treeParents: ReadonlyMap<number, number>;
  readonly rootSystemId: number | null;
  /**
   * The kernel-placed k-space gate halo, updated atomically with `state` on
   * each layout reply so a system upgrading from derived to authored swaps
   * owner in one commit — never a duplicate node. Purely derived presentation
   * (HC-1): nothing here is ever written anywhere.
   */
  readonly halo: PlacedHalo;
  /** Kernel-placed unresolved wormhole endpoints, keyed externally by their connection rows. */
  readonly stubs: readonly PlacedStub[];
  /** Sorted gate neighbours from the static asset; empty until it loads. */
  readonly neighboursOf: (systemId: number) => readonly number[];
  /** Stamps a dropped node's position as user-owned, protecting it until re-lock releases it. */
  readonly pinPlacement: (systemId: number, position: ChainPosition) => void;
  /**
   * Clears every user stamp and forces a fresh layout merge (re-lock). Positions
   * are untouched here; the next merge snaps them to kernel proposals.
   */
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
