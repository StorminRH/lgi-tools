'use client';

// The client half of the reactive read path: two split subscriptions and the
// layout-then-merge pipeline that turns them into canvas state.
//
// The two subscriptions are separate `useDrainedPages` calls against separate Convex functions — that
// is contract HC-2, and it is the entire reason a connection write does not re-read the systems
// range. Do not "simplify" them into one call over one aggregate query.
//
// Layout runs off the main thread through `useLayoutKernel`. The merge waits for
// positions (layout-then-merge): nothing ever appears at a wrong position first.
// The posted key (chain signature + layout revision) advances eagerly at post
// time so re-renders never cancel or repost in-flight work; staleness is decided
// by request id. The drag-protection set is read from a ref at apply time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import {
  useDrainedPages,
  type DrainedPages,
} from '@/data/convex/use-drained-pages';
import { useLiveValue } from '@/data/convex/use-live-value';
import type {
  ConnectionMassState,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import {
  loadUniverseAssets,
  type UniverseAssets,
} from '@/data/eve-data/universe-assets-client';
import { isTombstoned } from '@/data/maps/chain-contract';
import { deriveChainTree } from '../layout/facts';
import type { LayoutConfig, LayoutFacts } from '../layout/layout-contract';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
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
import type { ChainPosition, MapChainIntent } from './intents';
import { resolveSystemLabel, type SystemLabel } from './labels';
import { assignerFromPositions } from './placement';
import {
  applyUserPlacement,
  clearUserPlacements,
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

/**
 * Live connection fields the authoring card edits. Topology stays in reconciled
 * state; these travel beside it so a field patch never forces a layout merge.
 */
export interface ConnectionDetail {
  readonly connectionId: Id<'mapConnections'>;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly lifeStage: WormholeLifeStage | null;
}

/** The row shapes the signature summarizes, kept minimal so the function stays pure and testable. */
interface SignatureInput {
  readonly systems: { readonly rows: readonly { readonly systemId: number }[]; readonly complete: boolean };
  readonly connections: {
    readonly rows: readonly {
      readonly _id: string;
      readonly fromSystemId: number;
      readonly toSystemId: number;
    }[];
    readonly complete: boolean;
  };
}

/**
 * A content fingerprint of both collections, used to decide whether a merge is warranted.
 *
 * Content, never array identity: the subscription hooks hand back fresh arrays and a fresh wrapper
 * object on every render, so an identity comparison would re-merge forever — replaying every intent
 * continuously, which sub-version 4.0.3.2 would bind animations to. Exported so that stability is a
 * unit test rather than a property nothing checks; the separators cannot occur in numeric system ids
 * or Convex document ids, so no distinct content collides.
 *
 * Callers must pass LIVE rows only — tombstones are filtered upstream so a
 * tombstone patch changes this fingerprint and triggers the removal merge.
 */
export function chainSignature(
  systems: SignatureInput['systems'],
  connections: SignatureInput['connections'],
): string {
  return [
    systems.complete,
    systems.rows.map((row) => row.systemId).join(','),
    connections.complete,
    connections.rows
      .map((row) => `${row._id}:${row.fromSystemId}>${row.toSystemId}`)
      .join(','),
  ].join('#');
}

/**
 * Drops tombstoned rows while preserving page completeness and relative order.
 *
 * Runs upstream of {@link chainSignature}: the signature fingerprints only ids
 * and completeness, so filtering anywhere downstream would leave a ghost on
 * canvas until an unrelated change.
 */
export function filterLivePages<Row extends { readonly deletedAt?: number | null }>(
  pages: DrainedPages<Row>,
): DrainedPages<Row> {
  const live = pages.rows.filter((row) => !isTombstoned(row));
  if (live.length === pages.rows.length) return pages;
  return { rows: live, complete: pages.complete };
}

/**
 * Layout facts from a snapshot's server-ordered rows — never from reconciled
 * arrival order. Array position IS creation order for the kernel.
 */
export function factsFromSnapshot(snapshot: ChainSnapshot): LayoutFacts {
  return {
    systems: snapshot.systems.rows.map((row) => ({ systemId: row.systemId })),
    connections: snapshot.connections.rows.map((row) => ({
      fromSystemId: row.fromSystemId,
      toSystemId: row.toSystemId,
    })),
  };
}

/**
 * Stable fingerprint of dial state — part of the posted key. Exhaustive by
 * type: adding a `LayoutConfig` field without fingerprinting it here is a
 * compile error, because an unfingerprinted dial would commit state that never
 * changes the posted key — a silent no-op dial.
 */
export function layoutConfigKey(config: LayoutConfig): string {
  const parts = {
    ringSpacing: config.ringSpacing,
    minSeparation: config.minSeparation,
    wedgePolicy: config.wedgePolicy,
    siblingSpread: config.siblingSpread,
    directionSequence: config.directionSequence.join(','),
  } satisfies Record<keyof LayoutConfig, string | number>;
  return Object.values(parts).join('|');
}

/** Posted key: chain content, dial fingerprint, and the re-lock revision bump. */
export function layoutPostKey(
  signature: string,
  configKey: string,
  revision: number,
): string {
  return `${signature}#${configKey}@${revision}`;
}

/** What the chain host needs to render and interact with one map. */
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
  /** Live connection detail fields keyed by document id, for the authoring card. */
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly state: ChainState;
  /** The most recent merge's intents; sub-version 4.0.3.2 binds motion to these. */
  readonly intents: readonly MapChainIntent[];
  readonly labelOf: (systemId: number) => SystemLabel;
  /**
   * Child → parent for every tree-attached system, computed by re-running the
   * kernel's own `deriveChainTree` on the exact facts object the worker laid
   * out — the same pure function on the same input, so it cannot disagree with
   * the drawn positions (measured ~8µs at 60 systems; a deliberate main-thread
   * exception, recorded in the session as-built). The canvas draws tree links
   * solid and every other connection (loop closures) dashed, identically on
   * every client.
   */
  readonly treeParents: ReadonlyMap<number, number>;
  /** The deterministic chain root used as the current-system stand-in until location tracking. */
  readonly rootSystemId: number | null;
  /** Stamps a dropped node's position as user-owned, protecting it until re-lock releases it. */
  readonly pinPlacement: (systemId: number, position: ChainPosition) => void;
  /**
   * Clears every user stamp and forces a fresh layout merge (re-lock). Positions
   * are untouched here; the next merge snaps them to kernel proposals.
   */
  readonly releasePlacements: () => void;
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
 * user-placed node from its own state, so omitting one here cannot move it (HC-1). The set is
 * mirrored into a ref and read at apply time so protection cannot go stale across the async window.
 *
 * `config` is the live dial state; changing it bumps the layout revision so the
 * pipeline re-posts.
 */
export function useMapChain(
  mapId: string | null,
  draggingIds: ReadonlySet<number> = EMPTY_DRAG_SET,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
): MapChain {
  const args = mapId === null ? ('skip' as const) : { mapId };
  // The authority on revoked-versus-empty, and live: a re-granted claim flips this back to true and
  // the map returns without a reload. `canEdit` shares that claim row.
  const accessResult = useLiveValue(api.mapChain.watchMapAccess, args);
  const access: MapAccessState =
    accessResult === undefined ? undefined : accessResult.granted;
  const canEdit: boolean | undefined =
    accessResult === undefined ? undefined : accessResult.canEdit;

  const subscribedSystems = useDrainedPages(
    api.mapChain.watchMapSystems,
    args,
    PAGE_SIZE,
  );
  const subscribedConnections = useDrainedPages(
    api.mapChain.watchMapConnections,
    args,
    PAGE_SIZE,
  );
  // Tombstones still flow from the server (restore / .2 undo need the rows).
  // Filter LIVE rows here, upstream of the signature, so a tombstone patch
  // alone changes the fingerprint and drives the removal merge.
  const systems = filterLivePages(subscribedSystems);
  const connections = filterLivePages(subscribedConnections);
  const systemsComplete = systems.complete;
  const connectionDetails = useMemo(() => {
    const next = new Map<Id<'mapConnections'>, ConnectionDetail>();
    for (const row of connections.rows) {
      next.set(row._id, {
        connectionId: row._id,
        fromSystemId: row.fromSystemId,
        toSystemId: row.toSystemId,
        wormholeTypeCode: row.wormholeTypeCode,
        massState: row.massState,
        shipSize: row.shipSize,
        lifeStage: row.lifeStage ?? null,
      });
    }
    return next;
  }, [connections.rows]);

  const [merge, setMerge] = useState<ChainMerge>(INITIAL_MERGE);
  const [treeParents, setTreeParents] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );
  const [rootSystemId, setRootSystemId] = useState<number | null>(null);
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
  const postKey = layoutPostKey(signature, configKey, layoutRevision);

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
        })),
        complete: connections.complete,
      },
    };

    const facts = factsFromSnapshot(snapshot);

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
  }, [postKey, systems, connections, layout, config]);

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
    access,
    canEdit,
    systemsComplete,
    connectionDetails,
    state: merge.state,
    intents: merge.intents,
    labelOf,
    treeParents,
    rootSystemId,
    pinPlacement,
    releasePlacements,
  };
}
