import type { CorpHoldingContext, HangarDivision, Placement } from './placement';

/** The client's names for divisions the corp never renamed (jEveAssets uses the same fallback). */
const DEFAULT_DIVISION_NAMES: Record<HangarDivision, string> = {
  1: '1st Division',
  2: '2nd Division',
  3: '3rd Division',
  4: '4th Division',
  5: '5th Division',
  6: '6th Division',
  7: '7th Division',
};

export interface PlacementLabel {
  /** The structure name from the corp context; null when the caller resolves the NPC station or falls back. */
  readonly rootName: string | null;
  /** The division's in-game name, 'Deliveries', or '' for an unplaced row. */
  readonly hangar: string;
  /** The innermost container's in-game name; null when there is no container or it is not named yet. */
  readonly containerName: string | null;
}

function divisionName(division: HangarDivision, context: CorpHoldingContext): string {
  return context.divisionNames[division] ?? DEFAULT_DIVISION_NAMES[division];
}

function rootName(rootId: number | null, context: CorpHoldingContext): string | null {
  return rootId === null ? null : (context.structureNames.get(rootId) ?? null);
}

export function labelPlacement(placement: Placement, context: CorpHoldingContext): PlacementLabel {
  if (placement.kind === 'unplaced') {
    return { rootName: rootName(placement.rootId, context), hangar: '', containerName: null };
  }
  const innermost = placement.containers.at(-1);
  return {
    rootName: rootName(placement.rootId, context),
    hangar: placement.kind === 'hangar' ? divisionName(placement.division, context) : 'Deliveries',
    containerName: innermost === undefined ? null : (context.containerNames.get(innermost.itemId) ?? null),
  };
}
