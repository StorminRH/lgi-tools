import { asRecord, intOrNull, mapRecords, numOrNull } from './coerce';
import {
  ACTIVITY_NAME_TO_ID,
  ALL_ACTIVITY_NAMES,
  type ActivityName,
} from './constants';

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
