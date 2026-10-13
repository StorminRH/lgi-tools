import type { ContainerRef, CorpHoldingContext, HangarDivision, Placement } from './placement';

const DEFAULT_DIVISION_NAMES: Record<HangarDivision, string> = {
  1: '1st Division',
  2: '2nd Division',
  3: '3rd Division',
  4: '4th Division',
  5: '5th Division',
  6: '6th Division',
  7: '7th Division',
};

const STRUCTURE_ID_FLOOR = 1_000_000_000_000;
export const STRUCTURE_LABEL = 'Upwell structure';
export const UNKNOWN_LOCATION_LABEL = 'Unknown location';

export type EntityNames = Readonly<Record<string, string>>;

export type FormatStation = (name: string) => string;

export interface CorpHoldingLabel {
  readonly locationName: string;
  readonly locationFlag: string;
  readonly containerName: string | null;
}

function divisionName(division: HangarDivision, context: CorpHoldingContext): string {
  return context.divisionNames[division] ?? DEFAULT_DIVISION_NAMES[division];
}

function innermostContainer(placement: Placement): ContainerRef | undefined {
  return placement.kind === 'unplaced' ? undefined : placement.containers.at(-1);
}

/** Upwell structures take location ids from 1e12 up; NPC station ids sit far below. */
export function isPlayerStructureId(locationId: number): boolean {
  return locationId >= STRUCTURE_ID_FLOOR;
}

/** The Upwell structure label, else the formatted NPC station name, else Unknown location (an empty name counts as unknown). */
export function publicLocationName(locationId: number, names: EntityNames, formatStation: FormatStation): string {
  if (isPlayerStructureId(locationId)) return STRUCTURE_LABEL;
  const name = names[String(locationId)];
  return name ? formatStation(name) : UNKNOWN_LOCATION_LABEL;
}

function rootName(
  rootId: number | null,
  context: CorpHoldingContext,
  names: EntityNames,
  formatStation: FormatStation,
): string {
  if (rootId === null) return UNKNOWN_LOCATION_LABEL;
  return context.structureNames.get(rootId) ?? publicLocationName(rootId, names, formatStation);
}

function hangarName(placement: Placement, context: CorpHoldingContext): string {
  if (placement.kind === 'unplaced') return '';
  return placement.kind === 'hangar' ? divisionName(placement.division, context) : 'Deliveries';
}

function containerName(placement: Placement, context: CorpHoldingContext, names: EntityNames): string | null {
  const container = innermostContainer(placement);
  if (container === undefined) return null;
  return context.containerNames.get(container.itemId) ?? names[String(container.typeId)] ?? null;
}

export function corpHoldingNameIds(placement: Placement, context: CorpHoldingContext): number[] {
  const ids: number[] = [];
  if (placement.rootId !== null && !isPlayerStructureId(placement.rootId)) ids.push(placement.rootId);
  const container = innermostContainer(placement);
  if (container !== undefined && !context.containerNames.has(container.itemId)) ids.push(container.typeId);
  return ids;
}

export function labelCorpHolding(
  placement: Placement,
  context: CorpHoldingContext,
  names: EntityNames,
  formatStation: FormatStation,
): CorpHoldingLabel {
  return {
    locationName: rootName(placement.rootId, context, names, formatStation),
    locationFlag: hangarName(placement, context),
    containerName: containerName(placement, context, names),
  };
}
