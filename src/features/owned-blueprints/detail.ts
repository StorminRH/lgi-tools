import { type CorpContexts, corpContextOf } from '@/data/corp-holdings/context';
import {
  corpHoldingNameIds,
  type EntityNames,
  type FormatStation,
  isPlayerStructureId,
  labelCorpHolding,
  publicLocationName,
} from '@/data/corp-holdings/labels';
import { nameOrUnresolved } from '@/lib/format/names';
import type { OwnedBlueprintMap, OwnedBlueprintSummary } from './blueprint-map';
import type { OwnedBlueprintOwnerType } from './schema';

export interface OwnedBlueprintDetailEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: OwnedBlueprintOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  containerName: string | null;
}

function summaryNameIds(summary: OwnedBlueprintSummary, contexts: CorpContexts): number[] {
  if (summary.ownerType === 'corporation') {
    return corpHoldingNameIds(summary.placement, corpContextOf(contexts, summary.ownerId));
  }
  return isPlayerStructureId(summary.locationId) ? [] : [summary.locationId];
}

export function collectDetailNameIds(map: OwnedBlueprintMap, requestedTypeIds: number[], contexts: CorpContexts): number[] {
  const ids = new Set<number>();
  for (const typeId of requestedTypeIds) {
    const summary = map.get(typeId);
    if (summary === undefined) continue;
    ids.add(summary.ownerId);
    for (const id of summaryNameIds(summary, contexts)) ids.add(id);
  }
  return [...ids];
}

function resolveWhere(
  summary: OwnedBlueprintSummary,
  names: EntityNames,
  formatStation: FormatStation,
  contexts: CorpContexts,
): Pick<OwnedBlueprintDetailEntry, 'locationName' | 'locationFlag' | 'containerName'> {
  if (summary.ownerType === 'corporation') {
    return labelCorpHolding(summary.placement, corpContextOf(contexts, summary.ownerId), names, formatStation);
  }
  return {
    locationName: publicLocationName(summary.locationId, names, formatStation),
    locationFlag: summary.locationFlag,
    containerName: null,
  };
}

export function buildOwnedDetail(
  map: OwnedBlueprintMap,
  requestedTypeIds: number[],
  names: EntityNames,
  formatStation: FormatStation,
  contexts: CorpContexts,
): OwnedBlueprintDetailEntry[] {
  const entries: OwnedBlueprintDetailEntry[] = [];
  for (const typeId of requestedTypeIds) {
    const summary = map.get(typeId);
    if (summary === undefined) continue;
    entries.push({
      blueprintTypeId: typeId,
      me: summary.me,
      te: summary.te,
      ownerType: summary.ownerType,
      ownerName: nameOrUnresolved(names, summary.ownerId, summary.ownerType),
      ...resolveWhere(summary, names, formatStation, contexts),
    });
  }
  return entries;
}
