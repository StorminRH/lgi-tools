import type { ChainPosition } from './intents';

export interface PlacementCandidate {
  readonly systemId: number;
  readonly position: ChainPosition | null;
  readonly locked: boolean;
}

export interface PlacementEdge {
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

export interface PlacementInput {
  readonly systems: readonly PlacementCandidate[];
  readonly connections: readonly PlacementEdge[];
}

export type PlacementAssigner = (input: PlacementInput) => ReadonlyMap<number, ChainPosition>;

export function assignerFromPositions(
  positions: ReadonlyMap<number, ChainPosition>,
): PlacementAssigner {
  return () => positions;
}
