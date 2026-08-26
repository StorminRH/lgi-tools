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
import type { Doc, Id } from '@/data/convex/data-model';
import {
  useDrainedPages,
  type DrainedPages,
} from '@/data/convex/use-drained-pages';
import { useLiveValue } from '@/data/convex/use-live-value';
import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { systemSecurityClass } from '@/data/eve-data/security';
import {
  loadUniverseAssets,
  type UniverseAssets,
} from '@/data/eve-data/universe-assets-client';
import {
  chainTombstoneState,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  connectionDoorTypes,
  legacyTypeSnapshot,
} from '@/data/maps/connection-door-types';
import {
  appendHaloFacts,
  deriveHalo,
  EMPTY_HALO,
  EMPTY_PLACED_HALO,
  haloSignature,
  type HaloLimits,
  type PlacedHalo,
} from '../halo/halo-model';
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
import {
  destinationClassIdForCode,
  useSystemStaticSlots,
} from '../signatures/use-system-statics';
import type { ChainPosition, MapChainIntent } from './intents';
import { resolveSystemLabel, type SystemLabel } from './labels';
import {
  planStubNodes,
  type PlacedStub,
  type PlannedStub,
} from './nodes';
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
 * `convex/mapChainPage` — that module pulls in Convex's server runtime and does not belong in a browser
 * bundle — and a mismatch is harmless rather than a bug.
 */
const PAGE_SIZE = 100;

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();
const EMPTY_MAP_EVENTS: readonly Doc<'mapEvents'>[] = [];
const INITIAL_MERGE: ChainMerge = { state: EMPTY_CHAIN_STATE, intents: [] };
const TOMBSTONE_TICK_MS = 60_000;

/** Whether the caller holds access, or `undefined` until the access subscription first answers. */
export type MapAccessState = boolean | undefined;

export interface NormalizedMapAccess {
  readonly access: MapAccessState;
  readonly canEdit: boolean | undefined;
}

/** Normalizes the not-yet-answered access subscription without conflating it with denial. */
export function normalizeMapAccess(
  result: { readonly granted: boolean; readonly canEdit: boolean } | undefined,
): NormalizedMapAccess {
  if (result === undefined) return { access: undefined, canEdit: undefined };
  return { access: result.granted, canEdit: result.canEdit };
}

/** Builds the shared skip-or-map arguments for every chain subscription. */
function mapSubscriptionArgs(mapId: string | null): 'skip' | { mapId: string } {
  if (mapId === null) return 'skip';
  return { mapId };
}

/**
 * Live connection fields the authoring card edits. Topology stays in reconciled
 * state; these travel beside it so a field patch never forces a layout merge.
 */
export interface ConnectionEditorDetail {
  readonly connectionId: Id<'mapConnections'>;
  readonly _creationTime: number;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly fromSignalPct: number | null;
  readonly firstSeenAt: number | null;
  readonly wormholeTypeCode: string | null;
  readonly fromWormholeTypeCode?: string | null;
  readonly toWormholeTypeCode?: string | null;
  readonly typedSide?: 'from' | 'to' | null;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly lifeStage: WormholeLifeStage | null;
  readonly lifeStageObservedAt: number | null;
  readonly deathEarliestAt: number | null;
  readonly deathLatestAt: number | null;
  readonly deletedAt: number | null;
  readonly purgeAfter: number | null;
  readonly fromSignatureId: string | null;
  readonly toSignatureId: string | null;
  readonly fromDestinationHint: WormholeDestinationHint | null;
  readonly toDestinationHint?: WormholeDestinationHint | null;
  readonly fromDestinationSystemId?: number | null;
  readonly toDestinationSystemId?: number | null;
  readonly destinationProvenance: ConnectionProvenance | null;
  /** The recorded survivor list an `assumed` auto-link left for confirm/correct. */
  readonly pendingCandidates: readonly Id<'mapConnections'>[] | null;
  /** Tracked character that owes the answer for a pending assumed prompt. */
  readonly pendingResolutionCharacterId: number | null;
  readonly observedMassKg: number | null;
  readonly observedMassAtStateKg: number | null;
}

/** A resolved connection whose destination can anchor the canvas details card. */
export interface ConnectionDetail extends ConnectionEditorDetail {
  readonly toSystemId: number;
}

function connectionEditorDetail(
  row: Doc<'mapConnections'>,
): ConnectionEditorDetail {
  const doors = connectionDoorTypes(row);
  const snapshot = legacyTypeSnapshot(doors, row.typedSide ?? undefined);
  return {
    connectionId: row._id,
    _creationTime: row._creationTime,
    fromSystemId: row.fromSystemId,
    toSystemId: row.toSystemId,
    fromSignalPct: optionalOrNull(row.fromSignalPct),
    firstSeenAt: optionalOrNull(row.firstSeenAt),
    wormholeTypeCode: snapshot.wormholeTypeCode,
    fromWormholeTypeCode: doors.from,
    toWormholeTypeCode: doors.to,
    typedSide: snapshot.typedSide ?? null,
    massState: row.massState,
    shipSize: row.shipSize,
    lifeStage: optionalOrNull(row.lifeStage),
    lifeStageObservedAt: optionalOrNull(row.lifeStageObservedAt),
    deathEarliestAt: optionalOrNull(row.deathEarliestAt),
    deathLatestAt: optionalOrNull(row.deathLatestAt),
    deletedAt: optionalOrNull(row.deletedAt),
    purgeAfter: optionalOrNull(row.purgeAfter),
    fromSignatureId: optionalOrNull(row.fromSignatureId),
    toSignatureId: optionalOrNull(row.toSignatureId),
    fromDestinationHint: optionalOrNull(row.fromDestinationHint),
    toDestinationHint: optionalOrNull(row.toDestinationHint),
    fromDestinationSystemId: optionalOrNull(row.fromDestinationSystemId),
    toDestinationSystemId: optionalOrNull(row.toDestinationSystemId),
    destinationProvenance: optionalOrNull(row.destinationProvenance),
    pendingCandidates: optionalOrNull(row.pendingCandidates),
    pendingResolutionCharacterId: optionalOrNull(
      row.pendingResolutionCharacterId,
    ),
    observedMassKg: optionalOrNull(row.observedMassKg),
    observedMassAtStateKg: optionalOrNull(row.observedMassAtStateKg),
  };
}

function optionalOrNull<Value>(value: Value | null | undefined): Value | null {
  return value ?? null;
}

/** Projects subscribed connection documents into the stable card-detail map. */
export function connectionDetailsFromRows(
  rows: readonly Doc<'mapConnections'>[],
): ReadonlyMap<Id<'mapConnections'>, ConnectionDetail> {
  const details = new Map<Id<'mapConnections'>, ConnectionDetail>();
  for (const row of rows) {
    // The public subscription is resolved-only; keep this projection guarded
    // as a second boundary for direct/test callers holding a schema-wide Doc.
    if (row.toSystemId === null) continue;
    details.set(row._id, connectionEditorDetail(row) as ConnectionDetail);
  }
  return details;
}

/** One scanned-but-unexplored wormhole slot, projected for prompt labeling. */
export interface UnresolvedHoleSummary extends ConnectionEditorDetail {
  readonly toSystemId: null;
}

/** Projects subscribed unresolved-slot documents into stable prompt summaries. */
export function unresolvedHolesFromRows(
  rows: readonly Doc<'mapConnections'>[],
): readonly UnresolvedHoleSummary[] {
  return rows
    .filter((row) => row.toSystemId === null && !isTombstoned(row))
    .map((row) => connectionEditorDetail(row) as UnresolvedHoleSummary);
}

export interface StubLayoutRow extends UnresolvedHoleSummary {
  readonly fromSignatureId: string;
  /** Negative kernel-only id; EVE system ids are positive, so it cannot collide. */
  readonly layoutSystemId: number;
}

export type AccountedStubLayoutRow = PlannedStub & {
  readonly layoutSystemId: number;
};

/**
 * Selects scanned unresolved rows whose authored anchor is present and assigns
 * deterministic kernel-only ids in subscription order. A row already visible
 * in the resolved feed is excluded during a split-subscription handover.
 */
export function stubLayoutRows(
  rows: readonly UnresolvedHoleSummary[],
  systems: readonly { readonly systemId: number }[],
  resolvedConnections: readonly { readonly _id: string }[],
): readonly StubLayoutRow[] {
  const authored = new Set(systems.map((row) => row.systemId));
  const resolved = new Set(resolvedConnections.map((row) => row._id));
  const stubs: StubLayoutRow[] = [];
  for (const [index, row] of rows.entries()) {
    const signatureId = row.fromSignatureId;
    if (
      signatureId === null ||
      !authored.has(row.fromSystemId) ||
      resolved.has(row.connectionId)
    ) {
      continue;
    }
    stubs.push({
      ...row,
      fromSignatureId: signatureId,
      layoutSystemId: -(index + 1),
    });
  }
  return stubs;
}

/**
 * Retains the scanned rows selected by accounting at their original surrogate
 * ids, then assigns non-colliding ids to the guaranteed-static leaves.
 */
export function accountedStubLayoutRows(
  planned: readonly PlannedStub[],
  scanned: readonly StubLayoutRow[],
): readonly AccountedStubLayoutRow[] {
  const scannedIds = new Map<string, number>(
    scanned.map((row) => [row.connectionId, row.layoutSystemId]),
  );
  let nextStatic = scanned.length + 1;
  const rows: AccountedStubLayoutRow[] = [];
  for (const stub of planned) {
    if ('staticId' in stub) {
      rows.push({ ...stub, layoutSystemId: -(nextStatic++) });
      continue;
    }
    const layoutSystemId = scannedIds.get(stub.connectionId);
    if (layoutSystemId !== undefined) rows.push({ ...stub, layoutSystemId });
  }
  return rows;
}

function stubKey(row: PlannedStub): string {
  return 'staticId' in row ? `static:${row.staticId}` : row.connectionId;
}

/** Content key for the unresolved rows that participate in kernel layout. */
export function stubLayoutSignature(rows: readonly AccountedStubLayoutRow[]): string {
  return rows
    .map((row) => `${stubKey(row)}:${row.fromSystemId}>${row.layoutSystemId}`)
    .join(',');
}

/** Appends unresolved wormholes as leaf facts without changing authored identities. */
export function appendStubFacts(
  facts: LayoutFacts,
  rows: readonly AccountedStubLayoutRow[],
): LayoutFacts {
  if (rows.length === 0) return facts;
  return {
    ...facts,
    systems: [
      ...facts.systems,
      ...rows.map((row) => ({ systemId: row.layoutSystemId })),
    ],
    connections: [
      ...facts.connections,
      ...rows.map((row) => ({
        fromSystemId: row.fromSystemId,
        toSystemId: row.layoutSystemId,
      })),
    ],
  };
}

/** Maps a kernel reply back from surrogate ids to durable connection ids. */
export function stubPositionsFromLayout(
  rows: readonly AccountedStubLayoutRow[],
  positions: ReadonlyMap<number, ChainPosition>,
): ReadonlyMap<string, ChainPosition> {
  const placed = new Map<string, ChainPosition>();
  for (const row of rows) {
    const position = positions.get(row.layoutSystemId);
    if (position !== undefined) placed.set(stubKey(row), position);
  }
  return placed;
}

/** Joins current display facts to the latest kernel-owned stub positions. */
export function placedStubs(
  rows: readonly AccountedStubLayoutRow[],
  positions: ReadonlyMap<string, ChainPosition>,
): readonly PlacedStub[] {
  return rows.flatMap((row) => {
    const position = positions.get(stubKey(row));
    if (position === undefined) return [];
    const { layoutSystemId: _layoutSystemId, ...stub } = row;
    return [{ ...stub, position }];
  });
}

/** The row shapes the signature summarizes, kept minimal so the function stays pure and testable. */
export interface SignatureInput {
  readonly systems: { readonly rows: readonly { readonly systemId: number }[]; readonly complete: boolean };
  readonly connections: {
    readonly rows: readonly {
      readonly _id: string;
      readonly fromSystemId: number;
      readonly toSystemId: number;
      readonly deletedAt?: number | null;
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
 * Systems are live-only while connections include structural tombstones. The
 * connection liveness bit makes a tombstone/restore patch trigger one merge
 * without making ordinary detail-field patches re-run layout.
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
      .map(
        (row) =>
          `${row._id}:${isTombstoned(row) ? 0 : 1}:${row.fromSystemId}>${row.toSystemId}`,
      )
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

/** Keeps every connection row, including structural dying/skeleton ties. */
export function filterChainConnections<Row>(
  pages: DrainedPages<Row>,
): DrainedPages<Row> {
  return pages;
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

/**
 * Posted key: chain content, dial fingerprint, the re-lock revision bump, and
 * the halo/stub fingerprints. Both derived components are structural layout input, not
 * motion or fog state (the HC-4 rule stands): the adjacency asset landing
 * changes the facts the kernel must place without changing the authored
 * signature, and an unfingerprinted halo would silently never re-post.
 */
export function layoutPostKey(
  signature: string,
  configKey: string,
  revision: number,
  haloKey = '',
  stubKey = '',
): string {
  return `${signature}#${configKey}@${revision}~${haloKey}^${stubKey}`;
}

const EMPTY_NEIGHBOURS: readonly number[] = [];

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
  /** The most recent merge's intents; sub-version 4.0.3.2 binds motion to these. */
  readonly intents: readonly MapChainIntent[];
  readonly labelOf: (systemId: number) => SystemLabel;
  /**
   * Child → parent for every tree-attached system, computed by re-running the
   * kernel's own `deriveChainTree` on the exact facts object the worker laid
   * out — the same pure function on the same input, so it cannot disagree with
   * the drawn positions (measured ~8µs at 60 systems; a deliberate main-thread
   * exception, recorded in the session as-built). Halo systems are ordinary
   * facts entries, so their attachments appear here too. The canvas draws tree
   * links solid and every other connection (loop closures) dashed, identically
   * on every client.
   */
  readonly treeParents: ReadonlyMap<number, number>;
  /** The deterministic chain root used as the current-system stand-in until location tracking. */
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

/**
 * The session-memoized directory, or `null` until it lands. A failure stays null, silently.
 *
 * Exported as the mapper's one directory hook: the Signature Editor resolves its destination
 * readout from the same session load the canvas labels from, rather than opening a second one.
 */
export function useUniverseAssets(): UniverseAssets | null {
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

/** Subscribes and normalizes the split chain pages for one map. */
function useMapChainPages(mapId: string | null) {
  const args = mapSubscriptionArgs(mapId);
  // The authority on revoked-versus-empty, and live: a re-granted claim flips this back to true and
  // the map returns without a reload. `canEdit` shares that claim row.
  const accessResult = useLiveValue(api.mapChainAccess.watchMapAccess, args);
  const { access, canEdit } = normalizeMapAccess(accessResult);

  const subscribedSystems = useDrainedPages(
    api.mapChainSystems.watchMapSystems,
    args,
    PAGE_SIZE,
  );
  const subscribedConnections = useDrainedPages(
    api.mapChainConnections.watchMapConnections,
    args,
    PAGE_SIZE,
  );
  // The unresolved-slot feed is its own subscription by the same HC-2 split:
  // resolved-canvas writes and unresolved-slot writes re-read disjoint ranges.
  const subscribedUnresolved = useDrainedPages(
    api.mapChainConnections.watchUnresolvedHoles,
    args,
    PAGE_SIZE,
  );
  const subscribedEvents = useLiveValue(api.mapChainEvents.watchMapEvents, args);
  // Memoizing the normalized page objects keeps field-only/timer renders from
  // rebuilding connectionDetails or reposting layout work.
  const systems = useMemo(
    () =>
      filterLivePages({
        rows: subscribedSystems.rows,
        complete: subscribedSystems.complete,
      }),
    [subscribedSystems.rows, subscribedSystems.complete],
  );
  const connections = useMemo(
    () =>
      filterChainConnections({
        rows: subscribedConnections.rows,
        complete: subscribedConnections.complete,
      }),
    [subscribedConnections.rows, subscribedConnections.complete],
  );
  const events = subscribedEvents ?? EMPTY_MAP_EVENTS;
  const connectionDetails = useMemo(
    () => connectionDetailsFromRows(connections.rows),
    [connections.rows],
  );
  const unresolvedHoles = useMemo(
    () => unresolvedHolesFromRows(subscribedUnresolved.rows),
    [subscribedUnresolved.rows],
  );
  const scannedStubLayout = useMemo(
    () => stubLayoutRows(unresolvedHoles, systems.rows, connections.rows),
    [unresolvedHoles, systems.rows, connections.rows],
  );
  const authoredKey = systems.rows.map((row) => row.systemId).join(',');
  const staticSlots = useSystemStaticSlots(authoredKey);
  const plannedStubs = useMemo(
    () => planStubNodes({
      systemIds: systems.rows.map((row) => row.systemId),
      signatures: scannedStubLayout.map((row) => ({
        connectionId: row.connectionId,
        fromSystemId: row.fromSystemId,
        signatureId: row.fromSignatureId,
        wormholeTypeCode: row.wormholeTypeCode,
        destinationHint: row.fromDestinationHint,
        whClassId: row.wormholeTypeCode === null
          ? null
          : destinationClassIdForCode(row.wormholeTypeCode, staticSlots.codex),
      })),
      connections: connections.rows,
      staticsBySystem: staticSlots.bySystem,
      rootSystemId: systems.rows[0]?.systemId ?? null,
    }),
    [systems.rows, scannedStubLayout, connections.rows, staticSlots],
  );
  const stubLayout = useMemo(
    () => accountedStubLayoutRows(plannedStubs, scannedStubLayout),
    [plannedStubs, scannedStubLayout],
  );

  return {
    access,
    authoredKey,
    canEdit,
    connectionDetails,
    connections,
    events,
    stubLayout,
    systems,
    unresolvedHoles,
  };
}

function useConnectionPresentationNow(
  connections: ReturnType<typeof useMapChainPages>['connections'],
) {
  const [connectionPresentationNow, setConnectionPresentationNow] = useState(
    () => Date.now(),
  );
  const hasDyingConnection = connections.rows.some(
    (row) => chainTombstoneState(row, connectionPresentationNow) === 'dying',
  );

  useEffect(() => {
    if (!hasDyingConnection) return;
    const timer = window.setInterval(
      () => setConnectionPresentationNow(Date.now()),
      TOMBSTONE_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [hasDyingConnection]);

  return connectionPresentationNow;
}

function useMapChainHalo(
  authoredKey: string,
  stubLayout: readonly AccountedStubLayoutRow[],
  haloLimits?: HaloLimits,
) {
  const assets = useUniverseAssets();

  // The halo derivation is memoized on the authored-truth signature (never
  // per render, never per frame — the PD-3 cost boundary). The authored ids
  // are rebuilt FROM the key string so the dependency list is honest: the key
  // and the loaded asset are the only inputs the derivation reads.
  const halo = useMemo(() => {
    if (assets === null || authoredKey.length === 0) return EMPTY_HALO;
    return deriveHalo({
      authoredSystems: authoredKey
        .split(',')
        .map((id, order) => ({ systemId: Number(id), order })),
      neighbours: (id) => assets.neighbours(id),
      securityClassOf: (id) => {
        const entry = assets.systemInfo(id);
        if (entry === null) return undefined;
        return systemSecurityClass(entry.security, entry.whClassId);
      },
      limits: haloLimits,
    });
  }, [authoredKey, assets, haloLimits]);
  const haloKey = useMemo(() => haloSignature(halo), [halo]);
  const stubKey = useMemo(() => stubLayoutSignature(stubLayout), [stubLayout]);
  const labelOf = useCallback(
    (systemId: number): SystemLabel =>
      resolveSystemLabel(
        systemId,
        assets === null ? null : (id: number) => assets.systemInfo(id),
      ),
    [assets],
  );

  const neighboursOf = useCallback(
    (systemId: number): readonly number[] =>
      assets === null ? EMPTY_NEIGHBOURS : assets.neighbours(systemId),
    [assets],
  );

  return { halo, haloKey, labelOf, neighboursOf, stubKey };
}

function useMapChainMerge(
  systems: ReturnType<typeof useMapChainPages>['systems'],
  connections: ReturnType<typeof useMapChainPages>['connections'],
  stubLayout: readonly AccountedStubLayoutRow[],
  halo: ReturnType<typeof deriveHalo>,
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
          deletedAt: row.deletedAt ?? null,
          purgeAfter: row.purgeAfter ?? null,
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
 *
 * `haloLimits` is the development-only G-1 extent dial; omitted (or the
 * pinned object) it changes nothing — the halo fingerprint in the post key
 * re-posts layout when a dial commit changes the derivation.
 */
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
