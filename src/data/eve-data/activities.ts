import { numOrNull, intOrNull } from './coerce';
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

function asObject(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function mapEntries<T>(
  raw: unknown,
  fn: (entry: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const entry of raw) {
    const e = asObject(entry);
    if (!e) continue;
    const mapped = fn(e);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

function parseMaterials(raw: unknown): ActivityMaterial[] {
  return mapEntries(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const quantity = intOrNull(e.quantity);
    return typeId === null || quantity === null ? null : { typeId, quantity };
  });
}

function parseProducts(raw: unknown): ActivityProduct[] {
  return mapEntries(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const quantity = intOrNull(e.quantity);
    if (typeId === null || quantity === null) return null;
    const probability = numOrNull(e.probability);
    return probability === null ? { typeId, quantity } : { typeId, quantity, probability };
  });
}

function parseSkills(raw: unknown): ActivitySkill[] {
  return mapEntries(raw, (e) => {
    const typeId = intOrNull(e.typeID);
    const level = intOrNull(e.level);
    return typeId === null || level === null ? null : { typeId, level };
  });
}

export function parseBlueprintActivities(raw: unknown): BlueprintActivitySet {
  const activities = asObject(raw);
  if (!activities) return [];
  const out: BlueprintActivitySet = [];
  for (const name of ALL_ACTIVITY_NAMES) {
    const act = asObject(activities[name]);
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
