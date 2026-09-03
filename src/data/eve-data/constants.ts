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

/**
 * Dogma attribute ids used ONLY to enumerate + fit-match industry rigs in the SDE
 * picker. A rig FITS a structure when one of its `canFitShipGroup01/02/03` attrs
 * equals the structure's group id AND its rig-size attr equals the structure's
 * (CCP's actual fitting rule — not a "role"). A rig is an INDUSTRY rig (vs a
 * defensive/service module that also fits these groups) when it carries the
 * material-reduction attr (manufacturing) or the reaction-time attr (reaction).
 * The full bonus math reads the rest of the dogma in the industry-planner slice —
 * these ids are duplicated here purely for the enumeration filter, because the
 * data slice may not import the feature and the verified structure-bonus constants
 * must not be edited this session.
 */
export const STRUCTURE_RIG_SIZE_ATTR = 1547;

export const RIG_CAN_FIT_GROUP_ATTRS = [1298, 1299, 1300] as const;

export const RIG_MFG_MATERIAL_ATTR = 2594;

export const RIG_REACTION_TIME_ATTR = 2713;

export const DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL = 1982;

export const BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure';
