'use client';

// Layout-then-merge: nothing ever appears at a wrong position first.
// Layout runs off the main thread through `useLayoutKernel`. The posted key
// (chain signature + layout revision) advances eagerly at post time so
// re-renders never cancel or repost in-flight work; staleness is decided by
// request id. The drag-protection set is read from a ref at apply time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tombstoneDeletedAt } from '@/data/maps/chain-contract';
import {
  appendHaloFacts,
  EMPTY_PLACED_HALO,
  type HaloDerivation,
  type PlacedHalo,
} from '../halo/halo-model';
import { deriveChainTree } from '../layout/facts';
import type { LayoutConfig } from '../layout/layout-contract';
import {
  acceptReply,
  failRequest,
  initialKernelRequestState,
  postRequest,
  type KernelRequestState,
} from '../layout/kernel-requests';
import {
  LAYOUT_KERNEL_TEARDOWN,
  useLayoutKernel,
} from '../layout/use-layout-kernel';
import {
  chainSignature,
  factsFromSnapshot,
  layoutConfigKey,
  layoutPostKey,
} from './chain-signature';
import type { ChainPosition } from './intents';
import { assignerFromPositions } from './placement';
import {
  applyUserPlacement,
  clearUserPlacements,
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainMerge,
  type ChainSnapshot,
} from './reconciler';
import {
  appendStubFacts,
  placedStubs,
  stubPositionsFromLayout,
  type AccountedStubLayoutRow,
} from './stub-layout';
import type { MapChainPages } from './use-map-chain-pages';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();
const INITIAL_MERGE: ChainMerge = { state: EMPTY_CHAIN_STATE, intents: [] };

export function useMapChainMerge(
  systems: MapChainPages['systems'],
  connections: MapChainPages['connections'],
  stubLayout: readonly AccountedStubLayoutRow[],
  halo: HaloDerivation,
  haloKey: string,
  stubKey: string,
  draggingIds: ReadonlySet<number>,
  config: LayoutConfig,
) {
  const [merge, setMerge] = useState<ChainMerge>(INITIAL_MERGE);
  const [treeParents, setTreeParents] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );
  const [rootSystemId, setRootSystemId] = useState<number | null>(null);
  const [placedHalo, setPlacedHalo] = useState<PlacedHalo>(EMPTY_PLACED_HALO);
  const [stubPositions, setStubPositions] = useState<ReadonlyMap<string, ChainPosition>>(
    () => new Map(),
  );
  const [layoutRevision, setLayoutRevision] = useState(0);
  const requestStateRef = useRef<KernelRequestState>(initialKernelRequestState());
  const draggingRef = useRef<ReadonlySet<number>>(EMPTY_DRAG_SET);

  // Mirrored after commit (render must stay pure): declared before the posting
  // effect so the ref is current before any post in the same commit. An apply
  // callback landing in the paint gap before this runs reads a one-render-old
  // set; the rendered node is still safe because `syncNodes` holds the local
  // position for every actively dragging id, and drag stop re-stamps `user`.
  useEffect(() => {
    draggingRef.current = draggingIds;
  }, [draggingIds]);

  const layout = useLayoutKernel();
  const signature = chainSignature(systems, connections);
  const configKey = layoutConfigKey(config);
  const postKey = layoutPostKey(
    signature,
    configKey,
    layoutRevision,
    haloKey,
    stubKey,
  );

  useEffect(() => {
    const posted = postRequest(requestStateRef.current, postKey);
    if (posted.kind === 'skipped') return;
    requestStateRef.current = posted.state;
    const { requestId } = posted;

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
          deletedAt: tombstoneDeletedAt(row),
          purgeAfter:
            row.tombstone.kind === 'removed' ? row.tombstone.purgeAfter : null,
        })),
        complete: connections.complete,
      },
    };

    // Halo systems and gate links enter the same kernel as ordinary facts
    // entries, appended after every authored entry so the authored tree —
    // root above all — is untouched.
    const facts = appendStubFacts(
      appendHaloFacts(factsFromSnapshot(snapshot), halo),
      stubLayout,
    );

    // `config` is captured directly: its identity only changes on a real dial
    // commit, and any such commit also changes `postKey`, so this adds no
    // reruns beyond the posting the key already demands.
    void layout(facts, config).then(
      (positions) => {
        if (!acceptReply(requestStateRef.current, requestId)) return;
        setMerge((previous) =>
          reconcileChain(
            previous.state,
            snapshot,
            draggingRef.current,
            assignerFromPositions(positions),
          ),
        );
        // Placed atomically with the merge (one batched commit), so a halo
        // system authored by a jump swaps derived → authored without ever
        // rendering twice.
        setPlacedHalo(
          halo.systems.length === 0
            ? EMPTY_PLACED_HALO
            : {
                systems: halo.systems.flatMap((system) => {
                  const position = positions.get(system.systemId);
                  // The kernel answers every input system; skip defensively
                  // rather than inventing a position.
                  return position === undefined ? [] : [{ ...system, position }];
                }),
                links: halo.links,
              },
        );
        setStubPositions(stubPositionsFromLayout(stubLayout, positions));
        const tree = deriveChainTree(facts);
        setTreeParents(tree.parents);
        setRootSystemId(tree.rootSystemId);
      },
      (error: unknown) => {
        // Teardown is expected lifecycle (unmount, StrictMode's dev remount);
        // resetting the posted key still lets a survivor retry, silently.
        if (!(error instanceof Error && error.message === LAYOUT_KERNEL_TEARDOWN)) {
          console.error('layout merge skipped', error);
        }
        requestStateRef.current = failRequest(requestStateRef.current, requestId);
      },
    );
  }, [postKey, systems, connections, layout, config, halo, stubLayout]);
  const stubs = useMemo(
    () => placedStubs(stubLayout, stubPositions),
    [stubLayout, stubPositions],
  );

  const pinPlacement = useCallback(
    (systemId: number, position: ChainPosition) => {
      setMerge((previous) => ({
        state: applyUserPlacement(previous.state, systemId, position),
        intents: [],
      }));
    },
    [setMerge],
  );

  const releasePlacements = useCallback(() => {
    setMerge((previous) => ({
      state: clearUserPlacements(previous.state),
      intents: [],
    }));
    setLayoutRevision((revision) => revision + 1);
  }, [setMerge, setLayoutRevision]);

  return {
    merge,
    pinPlacement,
    placedHalo,
    releasePlacements,
    rootSystemId,
    stubs,
    treeParents,
  };
}
