import { isStaticPlaceholder, seatOrderOf } from '@/data/maps/connection-hallway';
import type { LayoutFacts } from '../layout/layout-contract';
import type { UnresolvedHoleSummary } from './connection-detail';
import type { ChainPosition } from './intents';
import type { PlacedStub, PlannedStub } from './nodes';

export interface StubLayoutRow extends UnresolvedHoleSummary {
  readonly layoutSystemId: number;
}

export type AccountedStubLayoutRow = PlannedStub & {
  readonly layoutSystemId: number;
  readonly _creationTime?: number;
  readonly seatOrderAt?: number;
  readonly staticCode?: string;
};

export interface SeatOrderedConnection {
  readonly _id: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly _creationTime: number;
  readonly seatOrderAt?: number;
  readonly staticCode?: string;
}

export interface SeatOrderedStub {
  readonly fromSystemId: number;
  readonly layoutSystemId: number;
  readonly _creationTime?: number;
  readonly seatOrderAt?: number;
  readonly staticCode?: string;
  readonly connectionId?: string;
  readonly staticId?: string;
}

export interface SeatOrderedHolder {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly _creationTime: number;
  readonly seatOrderAt?: number;
  readonly staticCode?: string;
}

export interface SeatOrderedInput {
  readonly systems: readonly { readonly systemId: number }[];
  readonly connections: readonly SeatOrderedConnection[];
  readonly stubRows: readonly SeatOrderedStub[];
  readonly slotHolders: readonly SeatOrderedHolder[];
}

export interface SeatOrderedLayout {
  readonly facts: LayoutFacts;
  readonly childIdBySeatKey: ReadonlyMap<string, number>;
}

type SeatKind = 'resolved' | 'stub' | 'holder';

interface SeatCandidate {
  readonly seatKey: string;
  readonly seatOrder: number;
  readonly tieId: string;
  readonly fromSystemId: number;
  readonly kind: SeatKind;
  readonly childId: number | null;
}

interface SeatedChild {
  readonly seatKey: string;
  readonly seatOrder: number;
  readonly tieId: string;
  readonly fromSystemId: number;
  readonly kind: SeatKind;
  readonly childId: number;
}

const KIND_RANK: Readonly<Record<SeatKind, number>> = {
  resolved: 0,
  stub: 1,
  holder: 2,
};

export function stubLayoutRows(
  rows: readonly UnresolvedHoleSummary[],
  systems: readonly { readonly systemId: number }[],
  resolvedConnections: readonly { readonly _id: string }[],
): readonly StubLayoutRow[] {
  const authored = new Set(systems.map((row) => row.systemId));
  const resolved = new Set(resolvedConnections.map((row) => row._id));
  const stubs: StubLayoutRow[] = [];
  for (const row of rows) {
    if (
      (row.from.signatureId === null && !isStaticPlaceholder(row))
      || !authored.has(row.fromSystemId)
      || resolved.has(row.connectionId)
    ) {
      continue;
    }
    stubs.push({
      ...row,
      layoutSystemId: -(stubs.length + 1),
    });
  }
  return stubs;
}

function scannedSeatFields(row: StubLayoutRow): Pick<
  AccountedStubLayoutRow,
  '_creationTime' | 'seatOrderAt' | 'staticCode'
> {
  return {
    _creationTime: row._creationTime,
    ...(row.seatOrderAt === undefined ? {} : { seatOrderAt: row.seatOrderAt }),
    ...(row.staticCode === undefined ? {} : { staticCode: row.staticCode }),
  };
}

export function accountedStubLayoutRows(
  planned: readonly PlannedStub[],
  scanned: readonly StubLayoutRow[],
): readonly AccountedStubLayoutRow[] {
  const scannedById = new Map<string, StubLayoutRow>(
    scanned.map((row) => [row.connectionId, row]),
  );
  let nextStatic = scanned.length + 1;
  const rows: AccountedStubLayoutRow[] = [];
  for (const stub of planned) {
    const scannedRow = scannedById.get(
      'staticId' in stub ? stub.staticId : stub.connectionId,
    );
    if (scannedRow !== undefined) {
      rows.push({
        ...stub,
        layoutSystemId: scannedRow.layoutSystemId,
        ...scannedSeatFields(scannedRow),
      });
      continue;
    }
    if ('staticId' in stub) {
      rows.push({ ...stub, layoutSystemId: -(nextStatic++) });
    }
  }
  return rows;
}

function seatKey(row: {
  readonly staticCode?: string;
  readonly fromSystemId: number;
  readonly connectionId?: string;
  readonly _id?: string;
  readonly staticId?: string;
}): string {
  if (row.staticCode !== undefined) {
    return `static:${row.fromSystemId}:${row.staticCode}`;
  }
  if (row.connectionId !== undefined) return row.connectionId;
  if (row._id !== undefined) return row._id;
  if (row.staticId !== undefined) return `static:${row.staticId}`;
  return '';
}

function stubKey(row: AccountedStubLayoutRow): string {
  return seatKey(row);
}

export function stubLayoutSignature(rows: readonly AccountedStubLayoutRow[]): string {
  return rows
    .map((row) => `${stubKey(row)}:${row.fromSystemId}>${row.layoutSystemId}`)
    .join(',');
}

function slotHolderSignature(
  holders: readonly SeatOrderedHolder[],
): string {
  return [...holders]
    .map((row) => `${seatKey(row)}:${row.fromSystemId}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join(',');
}

export function stubPostKey(
  rows: readonly AccountedStubLayoutRow[],
  holders: readonly SeatOrderedHolder[] = [],
): string {
  return `${stubLayoutSignature(rows)}#${slotHolderSignature(holders)}`;
}

function compareSeat(
  left: { readonly seatOrder: number; readonly tieId: string },
  right: { readonly seatOrder: number; readonly tieId: string },
): number {
  if (left.seatOrder !== right.seatOrder) return left.seatOrder - right.seatOrder;
  if (left.tieId < right.tieId) return -1;
  if (left.tieId > right.tieId) return 1;
  return 0;
}

function collectCandidates(input: SeatOrderedInput): SeatCandidate[] {
  const candidates: SeatCandidate[] = [];
  for (const row of input.connections) {
    if (row.toSystemId === null) continue;
    candidates.push({
      seatKey: seatKey(row),
      seatOrder: seatOrderOf(row),
      tieId: row._id,
      fromSystemId: row.fromSystemId,
      kind: 'resolved',
      childId: row.toSystemId,
    });
  }
  for (const row of input.stubRows) {
    candidates.push({
      seatKey: seatKey(row),
      seatOrder: seatOrderOf({
        _creationTime: row._creationTime ?? 0,
        seatOrderAt: row.seatOrderAt,
      }),
      tieId: row.connectionId ?? row.staticId ?? String(row.layoutSystemId),
      fromSystemId: row.fromSystemId,
      kind: 'stub',
      childId: row.layoutSystemId,
    });
  }
  for (const row of input.slotHolders) {
    candidates.push({
      seatKey: seatKey(row),
      seatOrder: seatOrderOf(row),
      tieId: row.connectionId,
      fromSystemId: row.fromSystemId,
      kind: 'holder',
      childId: null,
    });
  }
  return candidates;
}

function collapseSeats(candidates: readonly SeatCandidate[]): SeatCandidate[] {
  const groups = new Map<string, SeatCandidate>();
  for (const candidate of candidates) {
    const existing = groups.get(candidate.seatKey);
    if (existing === undefined) {
      groups.set(candidate.seatKey, candidate);
      continue;
    }
    const kindCmp = KIND_RANK[candidate.kind] - KIND_RANK[existing.kind];
    const takeCandidate =
      kindCmp < 0 || (kindCmp === 0 && compareSeat(candidate, existing) < 0);
    const preferred = takeCandidate ? candidate : existing;
    groups.set(candidate.seatKey, {
      seatKey: candidate.seatKey,
      seatOrder: Math.min(existing.seatOrder, candidate.seatOrder),
      tieId: existing.tieId < candidate.tieId ? existing.tieId : candidate.tieId,
      fromSystemId: preferred.fromSystemId,
      kind: preferred.kind,
      childId: preferred.childId,
    });
  }
  return [...groups.values()].sort(compareSeat);
}

function assignHolderIds(
  groups: readonly SeatCandidate[],
  authoredIds: ReadonlySet<number>,
): SeatedChild[] {
  const usedIds = new Set(authoredIds);
  for (const group of groups) {
    if (group.childId !== null) usedIds.add(group.childId);
  }
  let nextHolder = -1;
  const seated: SeatedChild[] = [];
  for (const group of groups) {
    if (group.childId !== null) {
      seated.push({
        seatKey: group.seatKey,
        seatOrder: group.seatOrder,
        tieId: group.tieId,
        fromSystemId: group.fromSystemId,
        kind: group.kind,
        childId: group.childId,
      });
      continue;
    }
    while (usedIds.has(nextHolder)) nextHolder -= 1;
    seated.push({
      seatKey: group.seatKey,
      seatOrder: group.seatOrder,
      tieId: group.tieId,
      fromSystemId: group.fromSystemId,
      kind: group.kind,
      childId: nextHolder,
    });
    usedIds.add(nextHolder);
    nextHolder -= 1;
  }
  return seated;
}

export function seatOrderedLayout(input: SeatOrderedInput): SeatOrderedLayout {
  const seated = assignHolderIds(
    collapseSeats(collectCandidates(input)),
    new Set(input.systems.map((system) => system.systemId)),
  );
  const authored = new Set(input.systems.map((system) => system.systemId));
  const childIdBySeatKey = new Map<string, number>();
  const extraSystems: { readonly systemId: number }[] = [];
  const connections: { fromSystemId: number; toSystemId: number }[] = [];
  for (const child of seated) {
    childIdBySeatKey.set(child.seatKey, child.childId);
    connections.push({
      fromSystemId: child.fromSystemId,
      toSystemId: child.childId,
    });
    if (child.kind !== 'resolved' && !authored.has(child.childId)) {
      extraSystems.push({ systemId: child.childId });
      authored.add(child.childId);
    }
  }
  return {
    facts: {
      systems: [
        ...input.systems.map((system) => ({ systemId: system.systemId })),
        ...extraSystems,
      ],
      connections,
    },
    childIdBySeatKey,
  };
}

export function stubPositionsFromLayout(
  rows: readonly AccountedStubLayoutRow[],
  positions: ReadonlyMap<number, ChainPosition>,
  childIdBySeatKey?: ReadonlyMap<string, number>,
): ReadonlyMap<string, ChainPosition> {
  const placed = new Map<string, ChainPosition>();
  for (const row of rows) {
    const key = stubKey(row);
    const childId = childIdBySeatKey?.get(key) ?? row.layoutSystemId;
    const position = positions.get(childId);
    if (position !== undefined) placed.set(key, position);
  }
  return placed;
}

function drawnStub(
  row: AccountedStubLayoutRow,
  position: ChainPosition,
): PlacedStub {
  if ('staticId' in row) {
    return {
      staticId: row.staticId,
      fromSystemId: row.fromSystemId,
      code: row.code,
      className: row.className,
      whClassId: row.whClassId,
      position,
    };
  }
  return {
    connectionId: row.connectionId,
    fromSystemId: row.fromSystemId,
    signatureId: row.signatureId,
    wormholeTypeCode: row.wormholeTypeCode,
    whClassId: row.whClassId,
    ...(row.destinationHint === undefined ? {} : { destinationHint: row.destinationHint }),
    position,
  };
}

export function placedStubs(
  rows: readonly AccountedStubLayoutRow[],
  positions: ReadonlyMap<string, ChainPosition>,
): readonly PlacedStub[] {
  return rows.flatMap((row) => {
    const position = positions.get(stubKey(row));
    if (position === undefined) return [];
    return [drawnStub(row, position)];
  });
}
