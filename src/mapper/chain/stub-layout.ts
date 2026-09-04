import { isStaticPlaceholder } from '@/data/maps/connection-hallway';
import type { LayoutFacts } from '../layout/layout-contract';
import type { UnresolvedHoleSummary } from './connection-detail';
import type { ChainPosition } from './intents';
import type { PlacedStub, PlannedStub } from './nodes';

export interface StubLayoutRow extends UnresolvedHoleSummary {
  readonly layoutSystemId: number;
}

export type AccountedStubLayoutRow = PlannedStub & {
  readonly layoutSystemId: number;
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
    const scannedId = scannedIds.get(
      'staticId' in stub ? stub.staticId : stub.connectionId,
    );
    if (scannedId !== undefined) {
      rows.push({ ...stub, layoutSystemId: scannedId });
      continue;
    }
    if ('staticId' in stub) {
      rows.push({ ...stub, layoutSystemId: -(nextStatic++) });
    }
  }
  return rows;
}

function stubKey(row: PlannedStub): string {
  return 'staticId' in row ? `static:${row.staticId}` : row.connectionId;
}

export function stubLayoutSignature(rows: readonly AccountedStubLayoutRow[]): string {
  return rows
    .map((row) => `${stubKey(row)}:${row.fromSystemId}>${row.layoutSystemId}`)
    .join(',');
}

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
