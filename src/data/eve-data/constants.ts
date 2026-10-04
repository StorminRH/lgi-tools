/**
 * CCP's `blueprints.jsonl` keys each activity by a string; the resolver and
 * planner work in CCP's numeric activity IDs. This map is the single source of
 * truth for that translation. IDs per CCP/ESI industry docs:
 *   manufacturing 1, research_time 3, research_material 4, copying 5,
 *   invention 8, reaction 11.
 */
export const ACTIVITY_NAME_TO_ID: Record<ActivityName, number> = {
  manufacturing: 1,
  research_time: 3,
  research_material: 4,
  copying: 5,
  invention: 8,
  reaction: 11,
};

/**
 * Every activity CCP keys under a blueprint's `activities`, as the canonical
 * name list. Single source for iterating/typing the full activity set (the
 * `getBlueprintActivities` read + its `ActivityName` type) — distinct from
 * INDUSTRY_ACTIVITY_NAMES below, which is the narrow subset the resolver walks.
 * A co-located test pins this against ACTIVITY_NAME_TO_ID so the two can't drift.
 * ACTIVITY_NAME_TO_ID is typed Record\<ActivityName, number\> (ActivityName is derived
 * from this list), so a missing key is now a compile error and finite-key lookups
 * come back as `number`, not `number | undefined`; the test still pins the IDs.
 */
export const ALL_ACTIVITY_NAMES = [
  'manufacturing',
  'research_time',
  'research_material',
  'copying',
  'invention',
  'reaction',
] as const;
export type ActivityName = (typeof ALL_ACTIVITY_NAMES)[number];

export const ACTIVITY_ID_LABEL: Record<number, string> = {
  1: 'Manufacturing',
  3: 'TE Research',
  4: 'ME Research',
  5: 'Copying',
  8: 'Invention',
  11: 'Reaction',
};

/**
 * The only activities the resolver + planner walk: 1 = manufacturing,
 * 11 = reactions, as CCP string keys. Invention (8), copying (5), and research
 * (3, 4) are deliberately EXCLUDED — invention has a probability dimension we
 * don't model, and copying/research don't produce a tradeable output type. A
 * contributor adding one of these must also update the resolver's leaf-detection
 * and the tracked-types union; don't just append here.
 */
export const INDUSTRY_ACTIVITY_NAMES = ['manufacturing', 'reaction'] as const;

/**
 * Reference blueprints pinned by the tree-resolver test fixture. Their
 * flat material totals are committed in
 * `__fixtures__/blueprint-flat-materials.json` and any change to the
 * resolver that breaks one of them fails CI. Also doubles as the
 * "sample blueprint set" feeding the idempotency hash so a CCP patch
 * touching any of them flips the hash.
 */
export const REFERENCE_BLUEPRINT_TYPE_IDS = [691, 24699, 23758] as const;

export const ADVISORY_LOCK_SDE_INGEST = BigInt(8273619013);

export const SDE_META_KEY_VERSION = 'sde_version';
export const SDE_META_KEY_TREE_HASH = 'tree_resolver_hash';

export const TREE_RESOLVER_ALGO_VERSION = 'v3-published-producer';

export const SDE_ENGINEERING_COMPLEX_GROUP_ID = 1404;
export const SDE_REFINERY_GROUP_ID = 1406;
export const SDE_CITADEL_GROUP_ID = 1657;
export const SDE_INDUSTRY_STRUCTURE_GROUP_IDS = [
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
  SDE_CITADEL_GROUP_ID,
] as const;
export const SDE_STRUCTURE_MODULE_CATEGORY_ID = 66;
export const SDE_SKILL_CATEGORY_ID = 16;

/**
 * Dogma attribute ids for fit-matching structure rigs. A rig FITS a structure
 * when one of its `canFitShipGroup01/02/03` attrs equals the structure's group
 * id AND its rig-size attr equals the structure's (CCP's actual fitting rule —
 * not a "role"). Whether a rig is an industry rig, and what it bonuses, comes
 * from CCP's industry modifier sources (`industry_modifiers`), not from these.
 */
export const STRUCTURE_RIG_SIZE_ATTR = 1547;
export const RIG_CAN_FIT_GROUP_ATTRS = [1298, 1299, 1300] as const;

export const DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL = 1982;

/**
 * Standup Capital Shipyard I: the service module a structure must fit to build
 * capital ships. Which hulls take it comes from the module's own
 * canFitShipType / canFitShipGroup attributes, not from a list kept here.
 */
export const SDE_CAPITAL_SHIPYARD_TYPE_ID = 35881;

export const BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure';
