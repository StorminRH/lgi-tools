import { sql } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import { asRecord, dogmaAttributePairs, intOrNull, localizedEn, mapRecords, strOrNull } from './coerce';
import {
  industryAssemblyLines,
  industryInstallationTypes,
  industryModifiers,
  industryTargetFilters,
} from './schema';
import { insertChunked, readJsonl } from './sde-io';
import type { SdeJsonlPaths } from './source';

export type TargetFilterRow = {
  id: number;
  name: string;
  categoryIds: number[];
  groupIds: number[];
};

export type ModifierRow = {
  sourceTypeId: number;
  activity: string;
  kind: string;
  attributeId: number;
  filterId: number | null;
  factorHigh: number;
  factorLow: number;
  factorNull: number;
};

export type AssemblyLineRow = {
  id: number;
  name: string;
  activityId: number;
  categoryIds: number[];
  groupIds: number[];
  typeListIds: number[];
};

export type InstallationTypeRow = {
  typeId: number;
  assemblyLineIds: number[];
};

export type IndustryRules = {
  filters: TargetFilterRow[];
  modifiers: ModifierRow[];
  assemblyLines: AssemblyLineRow[];
  installationTypes: InstallationTypeRow[];
};

export type EffectModifier = {
  modifiedAttributeId: number;
  modifyingAttributeId: number;
  operation: number;
};

export type SourceDogma = {
  attributes: ReadonlyMap<number, number>;
  effectIds: readonly number[];
};

/** Dogma's post-percent operation: the target is scaled by (1 + modifier / 100). */
const POST_PERCENT = 6;
/** Dogma's post-multiply operation. */
const POST_MULTIPLY = 4;
/**
 * The runtime security modifier that structure rig percentages are multiplied
 * by. The game fills it per system from the rig's own high / low / null-sec
 * attributes; a rig with no value for a band does nothing there.
 */
const SECURITY_MODIFIER_ATTR = 2358;
const SECURITY_BAND_ATTRS = { high: 2355, low: 2356, null: 2357 } as const;

/** Ids from a plain id array, or from an array of records keyed by `key`. */
function idList(value: unknown, key?: string): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const id = intOrNull(key === undefined ? entry : asRecord(entry)?.[key]);
    return id === null ? [] : [id];
  });
}

export function parseTargetFilter(r: Record<string, unknown>): TargetFilterRow | null {
  const id = intOrNull(r._key);
  const name = localizedEn(r.name) ?? strOrNull(r.name);
  if (id === null || name === null) return null;
  return { id, name, categoryIds: idList(r.categoryIDs), groupIds: idList(r.groupIDs) };
}

export function parseAssemblyLine(r: Record<string, unknown>): AssemblyLineRow | null {
  const id = intOrNull(r._key);
  const name = localizedEn(r.name) ?? strOrNull(r.name);
  const activityId = intOrNull(r.activityID);
  if (id === null || name === null || activityId === null) return null;
  return {
    id,
    name,
    activityId,
    categoryIds: idList(r.detailsPerCategory, 'categoryID'),
    groupIds: idList(r.detailsPerGroup, 'groupID'),
    typeListIds: idList(r.detailsPerTypeList, 'typeListID'),
  };
}

export function parseInstallationType(r: Record<string, unknown>): InstallationTypeRow | null {
  const typeId = intOrNull(r._key);
  if (typeId === null) return null;
  return { typeId, assemblyLineIds: idList(r.assemblyLines, 'assemblyLineID') };
}

function parseEffectModifiers(r: Record<string, unknown>): EffectModifier[] {
  return mapRecords(r.modifierInfo, (info) => {
    const modifiedAttributeId = intOrNull(info.modifiedAttributeID);
    const modifyingAttributeId = intOrNull(info.modifyingAttributeID);
    const operation = intOrNull(info.operation);
    if (modifiedAttributeId === null || modifyingAttributeId === null || operation === null) return null;
    return { modifiedAttributeId, modifyingAttributeId, operation };
  });
}

function parseSourceDogma(r: Record<string, unknown>): SourceDogma {
  return {
    attributes: new Map(dogmaAttributePairs(r.dogmaAttributes)),
    effectIds: idList(r.dogmaEffects, 'effectID'),
  };
}

type Factors = { high: number; low: number; null: number };

/**
 * A hull carries its bonus as the multiplier itself. A rig carries a percentage
 * that one of its effects writes onto the structure, scaled by the system's
 * security band when another of its effects multiplies it by the security
 * modifier.
 */
function factorsFor(
  dogma: SourceDogma,
  attributeId: number,
  effects: ReadonlyMap<number, readonly EffectModifier[]>,
): Factors | null {
  const direct = dogma.attributes.get(attributeId);
  if (direct !== undefined) return { high: direct, low: direct, null: direct };
  const modifiers = dogma.effectIds.flatMap((id) => effects.get(id) ?? []);
  const writer = modifiers.find((m) => m.modifiedAttributeId === attributeId && m.operation === POST_PERCENT);
  if (!writer) return null;
  const pct = dogma.attributes.get(writer.modifyingAttributeId) ?? 0;
  const scaled = modifiers.some(
    (m) =>
      m.modifiedAttributeId === writer.modifyingAttributeId &&
      m.modifyingAttributeId === SECURITY_MODIFIER_ATTR &&
      m.operation === POST_MULTIPLY,
  );
  const factor = (bandAttr: number) => 1 + (pct * (scaled ? dogma.attributes.get(bandAttr) ?? 0 : 1)) / 100;
  return {
    high: factor(SECURITY_BAND_ATTRS.high),
    low: factor(SECURITY_BAND_ATTRS.low),
    null: factor(SECURITY_BAND_ATTRS.null),
  };
}

type SourceEntry = { activity: string; kind: string; attributeId: number; filterId: number | null };

function kindEntries(activity: string, kind: string, list: unknown): SourceEntry[] {
  return mapRecords(list, (entry) => {
    const attributeId = intOrNull(entry.dogmaAttributeID);
    return attributeId === null ? null : { activity, kind, attributeId, filterId: intOrNull(entry.filterID) };
  });
}

/** A modifier source's `activity → kind → [{ dogmaAttributeID, filterID? }]` tree, flattened. */
function sourceEntries(source: Record<string, unknown>): SourceEntry[] {
  return Object.entries(source).flatMap(([activity, value]) => {
    const kinds = asRecord(value);
    if (activity === '_key' || kinds === null) return [];
    return Object.entries(kinds).flatMap(([kind, list]) => kindEntries(activity, kind, list));
  });
}

/** CCP's modifier sources turned into ready factors, one per source, activity, kind and filter. */
export function resolveModifiers(
  sources: readonly Record<string, unknown>[],
  effects: ReadonlyMap<number, readonly EffectModifier[]>,
  dogmaByType: ReadonlyMap<number, SourceDogma>,
): { rows: ModifierRow[]; unresolved: number } {
  const rows: ModifierRow[] = [];
  let unresolved = 0;
  for (const source of sources) {
    const sourceTypeId = intOrNull(source._key);
    const dogma = sourceTypeId === null ? undefined : dogmaByType.get(sourceTypeId);
    for (const entry of sourceEntries(source)) {
      const factors = dogma ? factorsFor(dogma, entry.attributeId, effects) : null;
      if (sourceTypeId === null || factors === null) {
        unresolved += 1;
        continue;
      }
      rows.push({
        sourceTypeId,
        activity: entry.activity,
        kind: entry.kind,
        attributeId: entry.attributeId,
        filterId: entry.filterId,
        factorHigh: factors.high,
        factorLow: factors.low,
        factorNull: factors.null,
      });
    }
  }
  return { rows, unresolved };
}

export async function parseIndustryRules(paths: SdeJsonlPaths): Promise<IndustryRules> {
  const [filterRows, sources, effectRows, lineRows, installationRows] = await Promise.all([
    readJsonl(paths.industryTargetFilters),
    readJsonl(paths.industryModifierSources),
    readJsonl(paths.dogmaEffects),
    readJsonl(paths.industryAssemblyLines),
    readJsonl(paths.industryInstallationTypes),
  ]);
  const sourceTypeIds = new Set(sources.map((s) => intOrNull(s._key)));
  const dogmaRows = await readJsonl(paths.typeDogma, (r) => sourceTypeIds.has(intOrNull(r._key)));
  const effects = new Map(effectRows.map((r) => [intOrNull(r._key) ?? -1, parseEffectModifiers(r)]));
  const dogmaByType = new Map(dogmaRows.map((r) => [intOrNull(r._key) ?? -1, parseSourceDogma(r)]));
  const { rows: modifiers, unresolved } = resolveModifiers(sources, effects, dogmaByType);

  const rules: IndustryRules = {
    filters: mapRecords(filterRows, parseTargetFilter),
    modifiers,
    assemblyLines: mapRecords(lineRows, parseAssemblyLine),
    installationTypes: mapRecords(installationRows, parseInstallationType),
  };
  console.log(
    `Industry rules parse: ${rules.filters.length} target filters, ${modifiers.length} modifiers ` +
      `from ${sources.length} sources (${unresolved} unresolved), ${rules.assemblyLines.length} assembly lines, ` +
      `${rules.installationTypes.length} installation types.`,
  );
  return rules;
}

export type IndustryRulesEmitSummary = {
  targetFiltersWritten: number;
  modifiersWritten: number;
  assemblyLinesWritten: number;
  installationTypesWritten: number;
};

export async function emitIndustryRules(tx: AnyPgDb, rules: IndustryRules): Promise<IndustryRulesEmitSummary> {
  await tx.execute(
    sql`TRUNCATE TABLE ${industryTargetFilters}, ${industryModifiers}, ${industryAssemblyLines}, ${industryInstallationTypes}`,
  );
  await insertChunked(tx, industryTargetFilters, rules.filters);
  await insertChunked(tx, industryModifiers, rules.modifiers);
  await insertChunked(tx, industryAssemblyLines, rules.assemblyLines);
  await insertChunked(tx, industryInstallationTypes, rules.installationTypes);
  return {
    targetFiltersWritten: rules.filters.length,
    modifiersWritten: rules.modifiers.length,
    assemblyLinesWritten: rules.assemblyLines.length,
    installationTypesWritten: rules.installationTypes.length,
  };
}
