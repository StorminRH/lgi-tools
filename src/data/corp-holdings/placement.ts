import { z } from 'zod';

export type HangarDivision = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ContainerRef {
  readonly itemId: number;
  readonly typeId: number;
}

export type Placement =
  | {
      readonly kind: 'hangar';
      readonly rootId: number;
      readonly division: HangarDivision;
      readonly containers: readonly ContainerRef[];
    }
  | { readonly kind: 'deliveries'; readonly rootId: number; readonly containers: readonly ContainerRef[] }
  | { readonly kind: 'unplaced'; readonly rootId: number | null };

export type ContainedPlacement = Extract<Placement, { kind: 'hangar' | 'deliveries' }>;

export type Interior =
  | { readonly kind: 'office'; readonly rootId: number }
  | { readonly kind: 'root'; readonly rootId: number }
  | { readonly kind: 'within'; readonly placement: ContainedPlacement }
  | { readonly kind: 'opaque'; readonly rootId: number | null };

export type HoldingNodeKind = Interior['kind'];

export interface HoldingIndex {
  readonly interiors: ReadonlyMap<number, Interior>;
}

export interface HoldingNode {
  readonly itemId: number;
  readonly kind: HoldingNodeKind;
  readonly rootId: number | null;
  readonly division: HangarDivision | null;
  readonly deliveries: boolean;
  readonly containers: readonly ContainerRef[];
}

export type Knowable<T> = { readonly kind: 'known'; readonly value: T } | { readonly kind: 'unknown' };

export interface CorpHoldingContext {
  readonly corporationId: number;
  readonly index: HoldingIndex;
  readonly hq: Knowable<number>;
  readonly divisionNames: Partial<Record<HangarDivision, string>>;
  readonly containerNames: ReadonlyMap<number, string>;
  readonly structureNames: ReadonlyMap<number, string>;
}

const CORP_ASSET_LOCATION_TYPES = ['station', 'solar_system', 'item', 'other'] as const;

export interface CorpAssetItem {
  readonly itemId: number;
  readonly typeId: number;
  readonly locationId: number;
  readonly locationType: (typeof CORP_ASSET_LOCATION_TYPES)[number];
  readonly locationFlag: string;
}

const corpAssetItemSchema = z
  .object({
    item_id: z.number().int().positive(),
    type_id: z.number().int().positive(),
    location_id: z.number().int().positive(),
    location_type: z.enum(CORP_ASSET_LOCATION_TYPES),
    location_flag: z.string(),
  })
  .transform(
    (raw): CorpAssetItem => ({
      itemId: raw.item_id,
      typeId: raw.type_id,
      locationId: raw.location_id,
      locationType: raw.location_type,
      locationFlag: raw.location_flag,
    }),
  );

export function parseCorpAssetItems(items: readonly unknown[]): CorpAssetItem[] | null {
  const parsed = z.array(corpAssetItemSchema).safeParse(items);
  return parsed.success ? parsed.data : null;
}

const OFFICE_FLAG = 'OfficeFolder';
const DELIVERIES_FLAG = 'CorpDeliveries';
const MAX_CONTAINER_NESTING = 16;

const CONTAINER_CONTENT_FLAGS: ReadonlySet<string> = new Set(['Unlocked', 'Locked', 'AutoFit']);

const DIVISION_BY_FLAG: ReadonlyMap<string, HangarDivision> = new Map([
  ['CorpSAG1', 1],
  ['CorpSAG2', 2],
  ['CorpSAG3', 3],
  ['CorpSAG4', 4],
  ['CorpSAG5', 5],
  ['CorpSAG6', 6],
  ['CorpSAG7', 7],
]);

export function divisionOf(flag: string): HangarDivision | null {
  return DIVISION_BY_FLAG.get(flag) ?? null;
}

function placeInOffice(rootId: number, flag: string): Placement {
  const division = divisionOf(flag);
  return division === null ? { kind: 'unplaced', rootId } : { kind: 'hangar', rootId, division, containers: [] };
}

function placeAtRoot(rootId: number, flag: string): Placement {
  return flag === DELIVERIES_FLAG ? { kind: 'deliveries', rootId, containers: [] } : placeInOffice(rootId, flag);
}

function placeInContainer(placement: ContainedPlacement, flag: string): Placement {
  const isContent = CONTAINER_CONTENT_FLAGS.has(flag) || divisionOf(flag) !== null;
  return isContent ? placement : { kind: 'unplaced', rootId: placement.rootId };
}

function placeWithin(interior: Interior, flag: string): Placement {
  switch (interior.kind) {
    case 'root':
      return placeAtRoot(interior.rootId, flag);
    case 'office':
      return placeInOffice(interior.rootId, flag);
    case 'within':
      return placeInContainer(interior.placement, flag);
    case 'opaque':
      return { kind: 'unplaced', rootId: interior.rootId };
  }
}

const STALE_PARENT: Placement = { kind: 'unplaced', rootId: null };

export function placeUnder(index: HoldingIndex, parentId: number, locationFlag: string): Placement {
  const interior = index.interiors.get(parentId);
  return interior === undefined ? STALE_PARENT : placeWithin(interior, locationFlag);
}

function containerInterior(item: CorpAssetItem, placement: Placement): Interior {
  if (placement.kind === 'unplaced' || placement.containers.length >= MAX_CONTAINER_NESTING) {
    return { kind: 'opaque', rootId: placement.rootId };
  }
  const containers = [...placement.containers, { itemId: item.itemId, typeId: item.typeId }];
  return { kind: 'within', placement: { ...placement, containers } };
}

function resolveInterior(
  id: number,
  item: CorpAssetItem | undefined,
  parentInterior: (parentId: number) => Interior,
): Interior {
  if (item === undefined) return { kind: 'root', rootId: id };
  if (item.locationFlag === OFFICE_FLAG) return { kind: 'office', rootId: item.locationId };
  if (item.locationType === 'solar_system') return { kind: 'root', rootId: id };
  return containerInterior(item, placeWithin(parentInterior(item.locationId), item.locationFlag));
}

export function buildHoldingIndex(items: readonly CorpAssetItem[]): HoldingIndex {
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const interiors = new Map<number, Interior>();
  const resolving = new Set<number>();

  const interiorOf = (id: number): Interior => {
    const known = interiors.get(id);
    if (known !== undefined) return known;
    if (resolving.has(id)) return { kind: 'opaque', rootId: null };
    resolving.add(id);
    const interior = resolveInterior(id, byId.get(id), interiorOf);
    resolving.delete(id);
    interiors.set(id, interior);
    return interior;
  };

  for (const item of items) interiorOf(item.locationId);
  return { interiors };
}

function toHoldingNode(itemId: number, interior: Interior): HoldingNode {
  const empty = { itemId, kind: interior.kind, division: null, deliveries: false, containers: [] };
  if (interior.kind !== 'within') return { ...empty, rootId: interior.rootId };
  const { placement } = interior;
  return {
    ...empty,
    rootId: placement.rootId,
    division: placement.kind === 'hangar' ? placement.division : null,
    deliveries: placement.kind === 'deliveries',
    containers: placement.containers,
  };
}

export function toHoldingNodes(index: HoldingIndex): HoldingNode[] {
  return [...index.interiors].map(([itemId, interior]) => toHoldingNode(itemId, interior));
}

function withinFromNode(node: HoldingNode, rootId: number): Interior {
  const { containers } = node;
  if (node.division !== null) {
    return { kind: 'within', placement: { kind: 'hangar', rootId, division: node.division, containers } };
  }
  if (node.deliveries) return { kind: 'within', placement: { kind: 'deliveries', rootId, containers } };
  return { kind: 'opaque', rootId };
}

function fromHoldingNode(node: HoldingNode): Interior {
  if (node.kind === 'opaque' || node.rootId === null) return { kind: 'opaque', rootId: node.rootId };
  if (node.kind === 'within') return withinFromNode(node, node.rootId);
  return { kind: node.kind, rootId: node.rootId };
}

export function fromHoldingNodes(nodes: readonly HoldingNode[]): HoldingIndex {
  return { interiors: new Map(nodes.map((node) => [node.itemId, fromHoldingNode(node)])) };
}
