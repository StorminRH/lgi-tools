import {
  CHAIN_NODE_TYPE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  type ChainNode,
} from '../canvas/SystemNode';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import {
  chainTombstoneState,
  type ChainTombstoneState,
} from '@/data/maps/chain-contract';
import { hallwayDoorTypes } from '@/data/maps/connection-hallway';
import type { ConnectionDoorValue, ConnectionTombstone } from '@/data/maps/connection-hallway';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  believedHoles,
  type StaticStubSlot,
} from '@/data/maps/stub-accounting';
import type { HaloLink, PlacedHaloSystem } from '../halo/halo-model';
import { pairKey } from '../lib/pair-key';
import type { EdgeMotion } from '../motion/motion-contract';
import type { ChainPosition } from './intents';
import type { SystemLabel } from './labels';
import type { ChainState, VisibleConnection } from './reconciler';

export type ChainEdgeData = {

  readonly loop: boolean;

  readonly tombstoneState?: Exclude<ChainTombstoneState, 'skeleton'>;

  readonly halo?: true;

  readonly stub?: true;

  readonly fogSide?: 'source' | 'target';
  readonly motion?: EdgeMotion;
};

const HALO_EDGE_ID_PREFIX = 'halo:';

export const STUB_NODE_ID_PREFIX = 'stub:';

export const STATIC_STUB_NODE_ID_PREFIX = 'static-stub:';

export const STATIC_STUB_EDGE_ID_PREFIX = 'static-stub-edge:';

export function isHaloEdgeId(edgeId: string): boolean {
  return edgeId.startsWith(HALO_EDGE_ID_PREFIX);
}

export function isStubNodeId(nodeId: string): boolean {
  return nodeId.startsWith(STUB_NODE_ID_PREFIX)
    || nodeId.startsWith(STATIC_STUB_NODE_ID_PREFIX);
}

export interface PlacedStubConnection {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly signatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly whClassId: number | null;
  readonly destinationHint?: WormholeDestinationHint | null;
  readonly position: ChainPosition;
}

export interface PlacedStaticStub {
  readonly staticId: string;
  readonly fromSystemId: number;
  readonly code: string;
  readonly className: string;
  readonly whClassId: number;
  readonly position: ChainPosition;
}

export type PlacedStub = PlacedStubConnection | PlacedStaticStub;

export interface StubPlanningSignature {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly signatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly whClassId: number | null;
  readonly destinationHint?: WormholeDestinationHint | null;
}

export interface StubPlanningConnection {
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly tombstone?: ConnectionTombstone;
}

export type PlannedStub =
  | Omit<PlacedStubConnection, 'position'>
  | Omit<PlacedStaticStub, 'position'>;

function localConnectionFacts(
  connection: StubPlanningConnection,
  systemId: number,
): { readonly wormholeTypeCode: string | null; readonly linkedSignature: boolean } {
  const fromSide = connection.fromSystemId === systemId;
  const doors = hallwayDoorTypes(connection);
  return {
    wormholeTypeCode: fromSide ? doors.from : doors.to,
    linkedSignature: fromSide
      ? connection.from.signatureId != null
      : connection.to.signatureId != null,
  };
}

export function planStubNodes(input: {
  readonly systemIds: readonly number[];
  readonly signatures: readonly StubPlanningSignature[];
  readonly connections: readonly StubPlanningConnection[];
  readonly staticsBySystem: ReadonlyMap<number, readonly StaticStubSlot[]>;

  readonly rootSystemId: number | null;
}): readonly PlannedStub[] {
  const planned: PlannedStub[] = [];
  for (const systemId of input.systemIds) {
    const signatures = input.signatures.filter(
      (signature) => signature.fromSystemId === systemId,
    );
    const connections = input.connections.filter(
      (connection) =>
        !isTombstoned(connection)
        && (connection.fromSystemId === systemId || connection.toSystemId === systemId),
    );
    const plan = believedHoles({
      statics: input.staticsBySystem.get(systemId) ?? [],
      signatures: signatures.map((signature) => ({
        id: signature.connectionId,
        wormholeTypeCode: signature.wormholeTypeCode,
      })),
      connections: connections.map((connection) =>
        localConnectionFacts(connection, systemId)),
      isRoot: systemId === input.rootSystemId,
    });
    const drawnSignatures = new Set(plan.signatureStubIds);
    planned.push(
      ...signatures.filter((signature) => drawnSignatures.has(signature.connectionId)),
      ...plan.staticStubs.map((stub) => ({
        staticId: stub.id,
        fromSystemId: systemId,
        code: stub.code,
        className: stub.className,
        whClassId: stub.whClassId,
      })),
    );
  }
  return planned;
}

function staticStub(stub: PlacedStub): stub is PlacedStaticStub {
  return 'staticId' in stub;
}

export function stubNodeId(stub: PlacedStub): string {
  return staticStub(stub)
    ? `${STATIC_STUB_NODE_ID_PREFIX}${stub.staticId}`
    : `${STUB_NODE_ID_PREFIX}${stub.connectionId}`;
}

export interface ChainEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly data: ChainEdgeData;

  readonly selectable?: boolean;
  readonly focusable?: boolean;
}

const INERT_NODE_STYLE = { pointerEvents: 'none' } as const;

function stripDerivedControls(node: ChainNode): ChainNode {
  if (node.draggable === undefined && node.selectable === undefined) {
    return node;
  }
  const { draggable: _draggable, selectable: _selectable, ...rest } = node;
  return rest;
}

export function syncNodes(
  previous: readonly ChainNode[],
  systems: ChainState['systems'],
  labelOf: (systemId: number) => SystemLabel,
  dragging: ReadonlySet<number>,
  halo: readonly PlacedHaloSystem[] = [],
  stubs: readonly PlacedStub[] = [],
): ChainNode[] {
  const localById = new Map(previous.map((node) => [node.id, node]));

  const authored = [...systems.values()].map((placed): ChainNode => {
    const id = String(placed.systemId);
    const local = localById.get(id);
    const holdLocal = local !== undefined && dragging.has(placed.systemId);
    const label = labelOf(placed.systemId);

    return {
      ...(local === undefined ? undefined : stripDerivedControls(local)),
      id,
      type: CHAIN_NODE_TYPE,

      width: SYSTEM_FRAME_WIDTH,
      height: SYSTEM_FRAME_HEIGHT,
      position: holdLocal ? local.position : placed.position,
      style: INERT_NODE_STYLE,
      data: {
        name: label.name,
        className: label.className,
        security: label.security ?? null,
        whClassId: label.whClassId ?? null,
      },
    };
  });

  const haloNodes = halo
    .filter((placed) => !systems.has(placed.systemId))
    .map((placed): ChainNode => {
      const id = String(placed.systemId);
      const local = localById.get(id);
      const label = labelOf(placed.systemId);
      const node: ChainNode = {
        ...(local === undefined ? undefined : stripDerivedControls(local)),
        id,
        type: CHAIN_NODE_TYPE,
        width: SYSTEM_FRAME_WIDTH,
        height: SYSTEM_FRAME_HEIGHT,

        position: placed.position,
        draggable: false,
        style: INERT_NODE_STYLE,
        data: {
          name: label.name,
          className: label.className,
          security: label.security ?? null,
          whClassId: label.whClassId ?? null,
          halo: { ring: placed.ring, fogged: placed.fogged },
        },
      };
      if (!placed.fogged) return node;
      return {
        ...node,
        selected: false,
        selectable: false,
      };
    });

  const stubNodes = stubs
    .filter((stub) => systems.has(stub.fromSystemId))
    .map((stub): ChainNode => {
      const id = stubNodeId(stub);
      const local = localById.get(id);
      const isStatic = staticStub(stub);
      return {
        ...(local === undefined ? undefined : local),
        id,
        type: CHAIN_NODE_TYPE,
        width: SYSTEM_FRAME_WIDTH,
        height: SYSTEM_FRAME_HEIGHT,
        position: stub.position,
        draggable: false,
        selectable: false,
        selected: false,
        connectable: false,
        focusable: false,
        style: INERT_NODE_STYLE,
        data: {
          name: isStatic ? stub.code : stub.signatureId,
          className: isStatic ? stub.className : null,
          security: null,
          whClassId: stub.whClassId,
          ...(isStatic
            ? {}
            : { destinationHint: stub.destinationHint ?? null }),
          stub: isStatic
            ? {
                staticId: stub.staticId,
                fromSystemId: stub.fromSystemId,
                code: stub.code,
                className: stub.className,
                whClassId: stub.whClassId,
              }
            : {
                connectionId: stub.connectionId,
                fromSystemId: stub.fromSystemId,
                signatureId: stub.signatureId,
              },
        },
      };
    });

  return [...authored, ...haloNodes, ...stubNodes];
}

const EMPTY_FOGGED_IDS: ReadonlySet<number> = new Set();

function livePairKeys(
  connections: ChainState['connections'],
  now: number,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const connection of connections.values()) {
    if (chainTombstoneState(connection, now) === 'active') {
      keys.add(pairKey(connection.fromSystemId, connection.toSystemId));
    }
  }
  return keys;
}

function edgeTombstoneState(
  connection: VisibleConnection,
  now: number,
  livePairs: ReadonlySet<string>,
): Exclude<ChainTombstoneState, 'skeleton'> | null {
  const tombstoneState = chainTombstoneState(connection, now);
  if (tombstoneState === 'skeleton') return null;
  if (
    tombstoneState === 'dying'
    && livePairs.has(pairKey(connection.fromSystemId, connection.toSystemId))
  ) {
    return null;
  }
  return tombstoneState;
}

export function buildEdges(
  connections: ChainState['connections'],
  treeParents: ReadonlyMap<number, number>,
  now = Date.now(),
  haloLinks: readonly HaloLink[] = [],
  foggedSystemIds: ReadonlySet<number> = EMPTY_FOGGED_IDS,
  stubs: readonly PlacedStub[] = [],
): ChainEdge[] {
  const claim = newPairClaim(treeParents);
  const livePairs = livePairKeys(connections, now);
  const edges: ChainEdge[] = [];
  for (const connection of connections.values()) {
    const { fromSystemId, toSystemId } = connection;

    const tombstoneState = edgeTombstoneState(connection, now, livePairs);
    if (tombstoneState === null) continue;

    const solid = claim.claimSolid(fromSystemId, toSystemId);
    edges.push({
      id: connection.connectionId,
      source: String(fromSystemId),
      target: String(toSystemId),
      data: { loop: !solid, tombstoneState },
    });
  }
  for (const stub of stubs) {
    if (staticStub(stub) || !connections.has(stub.connectionId)) {
      edges.push({
        id: staticStub(stub)
          ? `${STATIC_STUB_EDGE_ID_PREFIX}${stub.staticId}`
          : stub.connectionId,
        source: String(stub.fromSystemId),
        target: stubNodeId(stub),
        data: { loop: false, tombstoneState: 'active', stub: true },
      });
    }
  }
  appendHaloEdges(edges, haloLinks, claim, foggedSystemIds);
  return edges;
}

function newPairClaim(treeParents: ReadonlyMap<number, number>) {
  const claimed = new Set<string>();
  const rendered = new Set<string>();
  return {

    claimSolid(a: number, b: number): boolean {
      const key = pairKey(a, b);
      const isTreeLink = treeParents.get(b) === a || treeParents.get(a) === b;
      const solid = isTreeLink && !claimed.has(key);
      if (solid) claimed.add(key);
      rendered.add(key);
      return solid;
    },
    rendered(a: number, b: number): boolean {
      return rendered.has(pairKey(a, b));
    },
  };
}

function appendHaloEdges(
  edges: ChainEdge[],
  haloLinks: readonly HaloLink[],
  claim: ReturnType<typeof newPairClaim>,
  foggedSystemIds: ReadonlySet<number>,
): void {
  for (const link of haloLinks) {
    if (claim.rendered(link.a, link.b)) continue;
    const aFogged = foggedSystemIds.has(link.a);
    const bFogged = foggedSystemIds.has(link.b);

    if (aFogged && bFogged) continue;
    const solid = claim.claimSolid(link.a, link.b);
    const fogSide = aFogged ? ('source' as const) : bFogged ? ('target' as const) : undefined;
    edges.push({
      id: `${HALO_EDGE_ID_PREFIX}${link.a}>${link.b}`,
      source: String(link.a),
      target: String(link.b),
      data: { loop: !solid, halo: true, ...(fogSide === undefined ? {} : { fogSide }) },
    });
  }
}
