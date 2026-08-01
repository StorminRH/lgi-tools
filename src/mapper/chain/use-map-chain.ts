'use client';

// The client half of the reactive read path: two split subscriptions and the merge that turns them
// into canvas state.
//
// The two subscriptions are separate `useDrainedPages` calls against separate Convex functions — that
// is contract HC-2, and it is the entire reason a connection write does not re-read the systems
// range. Do not "simplify" them into one call over one aggregate query.
//
// The raw Convex hooks are reached through `@/data/convex/use-drained-pages` rather than imported
// here: that slice owns the browser client and its hooks, and the ownership is lint-enforced. This
// module owns everything above transport — reconciliation, labelling, and drag protection.
//
// Loading is deliberately not modelled (contract HC-5): there is no spinner and no `isLoading` in the
// return value. The canvas renders immediately, nodes arrive as their pages land, and a still-draining
// collection is reported to the reconciler as incomplete so nothing is mistaken for a departure.
// Reconnection is likewise silent — the Convex client resumes its own subscriptions.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/data/convex/api';
import { useDrainedPages, useLiveValue } from '@/data/convex/use-drained-pages';
import {
  loadUniverseAssets,
  type UniverseAssets,
} from '@/data/eve-data/universe-assets-client';
import type { ChainPosition, MapChainIntent } from './intents';
import { resolveSystemLabel, type SystemLabel } from './labels';
import { gridAssigner } from './placement';
import {
  applyUserPlacement,
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainMerge,
  type ChainSnapshot,
  type ChainState,
} from './reconciler';

/**
 * Rows this client asks for per page.
 *
 * Independent of the server's own cap by design, not coupled to it: the handler clamps whatever
 * arrives, so this value only decides how many round trips a large map costs. It is not imported from
 * `convex/mapChain` — that module pulls in Convex's server runtime and does not belong in a browser
 * bundle — and a mismatch is harmless rather than a bug.
 */
const PAGE_SIZE = 100;

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();
const INITIAL_MERGE: ChainMerge = { state: EMPTY_CHAIN_STATE, intents: [] };

/** Whether the caller holds access, or `undefined` until the access subscription first answers. */
export type MapAccessState = boolean | undefined;

/** What the chain host needs to render and interact with one map. */
export interface MapChain {
  /**
   * Live access. `false` means the calm no-access state; `undefined` means not yet known, which
   * renders the same empty canvas as an authorized empty map (HC-5 — never a loading state).
   */
  readonly access: MapAccessState;
  readonly state: ChainState;
  /** The most recent merge's intents; sub-version 4.0.3.2 binds motion to these. */
  readonly intents: readonly MapChainIntent[];
  readonly labelOf: (systemId: number) => SystemLabel;
  /** Stamps a dropped node's position as user-owned, protecting it permanently. */
  readonly pinPlacement: (systemId: number, position: ChainPosition) => void;
}

/** The session-memoized directory, or `null` until it lands. A failure stays null, silently. */
function useUniverseAssets(): UniverseAssets | null {
  const [assets, setAssets] = useState<UniverseAssets | null>(null);

  useEffect(() => {
    let active = true;
    loadUniverseAssets().then(
      (loaded) => {
        if (active) setAssets(loaded);
      },
      () => {
        // HC-5: an unresolved label falls back to the system id rather than becoming an error or a
        // loading state. The loader resets its own memo on failure, so a later mount retries.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return assets;
}

/**
 * Subscribes to one map's chain and returns the reconciled picture.
 *
 * `mapId` of `null` subscribes to nothing. That is NOT sufficient on its own when no Convex
 * deployment is configured — the underlying hooks still require a provider even when skipped — so the
 * caller must also keep this hook unmounted behind the null-client gate.
 *
 * `draggingIds` is the canvas's active-drag set. The reconciler additionally protects every
 * user-placed node from its own state, so omitting one here cannot move it (HC-1).
 */
export function useMapChain(
  mapId: string | null,
  draggingIds: ReadonlySet<number> = EMPTY_DRAG_SET,
): MapChain {
  const args = mapId === null ? ('skip' as const) : { mapId };
  // The authority on revoked-versus-empty, and live: a re-granted claim flips this back to true and
  // the map returns without a reload.
  const accessResult = useLiveValue(api.mapChain.watchMapAccess, args);
  const access: MapAccessState =
    accessResult === undefined ? undefined : accessResult.granted;

  const systems = useDrainedPages(api.mapChain.watchMapSystems, args, PAGE_SIZE);
  const connections = useDrainedPages(
    api.mapChain.watchMapConnections,
    args,
    PAGE_SIZE,
  );

  const [merge, setMerge] = useState<ChainMerge>(INITIAL_MERGE);
  const appliedSignature = useRef<string | null>(null);

  // Content signature rather than array identity: the hooks hand back fresh arrays every render, so
  // identity alone would re-merge forever and drop each merge's intents on the floor.
  const signature = [
    systems.complete,
    systems.rows.map((row) => row.systemId).join(','),
    connections.complete,
    connections.rows
      .map((row) => `${row._id}:${row.fromSystemId}>${row.toSystemId}`)
      .join(','),
  ].join('#');

  useEffect(() => {
    if (appliedSignature.current === signature) return;
    appliedSignature.current = signature;

    const snapshot: ChainSnapshot = {
      systems: {
        rows: systems.rows.map((row) => ({ systemId: row.systemId })),
        complete: systems.complete,
      },
      connections: {
        rows: connections.rows.map((row) => ({
          connectionId: row._id,
          fromSystemId: row.fromSystemId,
          toSystemId: row.toSystemId,
        })),
        complete: connections.complete,
      },
    };

    setMerge((previous) =>
      reconcileChain(previous.state, snapshot, draggingIds, gridAssigner),
    );
  }, [signature, systems, connections, draggingIds]);

  const assets = useUniverseAssets();
  const labelOf = useCallback(
    (systemId: number): SystemLabel =>
      resolveSystemLabel(
        systemId,
        assets === null ? null : (id: number) => assets.systemInfo(id),
      ),
    [assets],
  );

  const pinPlacement = useCallback(
    (systemId: number, position: ChainPosition) => {
      setMerge((previous) => ({
        state: applyUserPlacement(previous.state, systemId, position),
        intents: [],
      }));
    },
    [],
  );

  return { access, state: merge.state, intents: merge.intents, labelOf, pinPlacement };
}
