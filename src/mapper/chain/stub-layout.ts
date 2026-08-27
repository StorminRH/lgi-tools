import type { LayoutFacts } from '../layout/layout-contract';
import type { UnresolvedHoleSummary } from './connection-detail';
import type { ChainPosition } from './intents';
import type { PlacedStub, PlannedStub } from './nodes';

export interface StubLayoutRow extends UnresolvedHoleSummary {
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
    if (
      row.from.signatureId === null ||
      !authored.has(row.fromSystemId) ||
      resolved.has(row.connectionId)
    ) {
      continue;
    }
    stubs.push({
      ...row,
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
