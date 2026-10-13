import { asRecord, intOrNull, mapRecords, numOrNull } from './coerce';
import {
  ACTIVITY_NAME_TO_ID,
  ALL_ACTIVITY_NAMES,
  type ActivityName,
} from './constants';
import type { BlueprintActivities } from './types';

export type ActivitySkill = { typeId: number; level: number };
export type ActivityMaterial = { typeId: number; quantity: number };
export type ActivityProduct = {
  typeId: number;
  quantity: number;
  probability?: number;
};

export type BlueprintActivity = {
  name: ActivityName;
  activityId: number;
  materials: ActivityMaterial[];
  products: ActivityProduct[];
  skills: ActivitySkill[];
  time: number | null;
};

export type BlueprintActivitySet = BlueprintActivity[];

function parseMaterials(raw: unknown): ActivityMaterial[] {
  return mapRecords(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const quantity = intOrNull(e.quantity);
    return typeId === null || quantity === null ? null : { typeId, quantity };
  });
}

function parseProducts(raw: unknown): ActivityProduct[] {
  return mapRecords(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const quantity = intOrNull(e.quantity);
    if (typeId === null || quantity === null) return null;
    const probability = numOrNull(e.probability);
    return probability === null ? { typeId, quantity } : { typeId, quantity, probability };
  });
}

function parseSkills(raw: unknown): ActivitySkill[] {
  return mapRecords(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const level = intOrNull(e.level);
    return typeId === null || level === null ? null : { typeId, level };
  });
}

export function parseBlueprintActivities(raw: unknown): BlueprintActivitySet {
  const activities = asRecord(raw);
  if (!activities) return [];
  const out: BlueprintActivitySet = [];
  for (const name of ALL_ACTIVITY_NAMES) {
    const act = asRecord(activities[name]);
    if (!act) continue;
    out.push({
      name,
      activityId: ACTIVITY_NAME_TO_ID[name],
      materials: parseMaterials(act.materials),
      products: parseProducts(act.products),
      skills: parseSkills(act.skills),
      time: numOrNull(act.time),
    });
  }
  return out;
}

type EntryCheck = (entry: Record<string, unknown>) => boolean;

const hasIntegers =
  (...keys: string[]): EntryCheck =>
  (entry) =>
    keys.every((key) => Number.isInteger(entry[key]));

const isMaterial = hasIntegers('typeID', 'quantity');
const isSkill = hasIntegers('typeID', 'level');
const isProduct: EntryCheck = (entry) =>
  isMaterial(entry) && (entry.probability === undefined || typeof entry.probability === 'number');

/** Whether an optional activity field is absent or an array whose every entry is a record that passes `check`. */
function isEntryList(list: unknown, check: EntryCheck): boolean {
  if (list === undefined) return true;
  return Array.isArray(list) && list.every((raw) => {
    const entry = asRecord(raw);
    return entry !== null && check(entry);
  });
}

function isActivityIO(raw: unknown): boolean {
  const act = asRecord(raw);
  return (
    act !== null &&
    isEntryList(act.materials, isMaterial) &&
    isEntryList(act.products, isProduct) &&
    isEntryList(act.skills, isSkill) &&
    (act.time === undefined || typeof act.time === 'number')
  );
}

/**
 * Whether `raw` is a CCP blueprint `activities` document the stored
 * `BlueprintActivities` type describes: an object of activity objects whose
 * materials and products carry integer `typeID` and `quantity`, whose skills
 * carry integer `typeID` and `level`, and whose `time` and product
 * `probability`, when present, are numbers. Ingest stores only documents that
 * pass, so readers of the column need no cast.
 */
export function isBlueprintActivitiesDocument(raw: unknown): raw is BlueprintActivities {
  const activities = asRecord(raw);
  return activities !== null && Object.values(activities).every(isActivityIO);
}
