// Parses CCP's blueprint `activities` JSONB blob into a typed, normalized shape
// covering EVERY activity — manufacturing, reaction, copying, research, and
// invention — with each activity's materials/products/skills/time and (invention
// only) per-product probability.
//
// This is the read the resolver deliberately does NOT do: `tree-resolver.ts`
// walks only manufacturing + reaction and ignores skills/probability (see
// INDUSTRY_ACTIVITY_NAMES). Ingest stores CCP's whole blob verbatim, so all of
// that data is already present in `industry_blueprints.activities`; this module
// is the typed reader future consumers (skills/fees, the invention planner) use
// instead of re-ingesting. Pure — no DB; the query that runs it lives in
// queries.ts (`getBlueprintActivities`).
//
// Normalization here: CCP ships `typeID` (camel-cap D); we emit `typeId` to match
// the resolver's output types. Inputs are trusted internal JSONB, so parsing is
// defensive-drop (a malformed entry is skipped, never thrown) rather than
// schema-validated.

import { numOrNull, intOrNull } from './coerce';
import {
  ACTIVITY_NAME_TO_ID,
  ALL_ACTIVITY_NAMES,
  type ActivityName,
} from './constants';

/** One skill requirement for a blueprint activity, including skill type ID and required level. */
export type ActivitySkill = { typeId: number; level: number };
/** One blueprint activity material requirement with type ID and base quantity. */
export type ActivityMaterial = { typeId: number; quantity: number };
/**
 * `probability` is present only on invention products (the per-run invention
 * success chance, e.g. 0.3); manufacturing/reaction products omit it.
 */
export type ActivityProduct = {
  typeId: number;
  quantity: number;
  probability?: number;
};

/** Normalized blueprint activity containing time, products, materials, and required skills. */
export type BlueprintActivity = {
  name: ActivityName;
  activityId: number; // CCP's numeric id, e.g. 'invention' → 8
  materials: ActivityMaterial[];
  products: ActivityProduct[];
  skills: ActivitySkill[];
  time: number | null; // base seconds for one run, ME0/TE0; null if absent
};

/**
 * Only activities actually present on the blueprint appear (no fabricated empty
 * placeholders). A consumer looks one up by name with `.find(a => a.name === …)`.
 */
export type BlueprintActivitySet = BlueprintActivity[];

function asObject(raw: unknown): Record<string, unknown> | null {
  // Exclude arrays: `typeof [] === 'object'`, but an array is never a CCP record
  // here, and casting one to Record<string, unknown> is unsound. (Downstream
  // parsers already yield empty results for an array, so this only tightens the
  // contract — no behaviour change.)
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

// Map each object entry of a CCP array field through `fn`, dropping non-object
// entries and any the mapper rejects (returns null). Shared by the three IO
// parsers so they each stay a single field-mapping expression.
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
    // Set probability only when CCP supplies a number, so non-invention products
    // read `probability === undefined` rather than a fabricated value.
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

/**
 * Parses raw SDE blueprint activities into normalized products, materials, time, and skill
 * requirements keyed by supported activity.
 */
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
