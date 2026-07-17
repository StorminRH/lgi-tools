// Shared constants for the eve-data slice.

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
/** Closed supported blueprint activity names shared by ingest, tree resolution, and planner consumers. */
export type ActivityName = (typeof ALL_ACTIVITY_NAMES)[number];

/**
 * Display labels for CCP's numeric activity IDs — the user-facing names for
 * the same six activities mapped above. Shared by every surface that shows an
 * activity (planner blueprint views, the industry-jobs tracker), so a label
 * edit lands everywhere at once.
 */
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

/**
 * Postgres advisory-lock key for the SDE ingest path. Held by:
 *   - /api/cron/refresh-sde when a drift triggers a re-ingest
 *   - pnpm db:refresh-sde / :prod CLIs
 *   - vercel-build's ingest-sde-if-empty.ts on the first deploy
 * Arbitrary project-unique bigint serializing the three SDE ingest paths
 * above against each other. The only advisory lock in the app now that the
 * prices refresh is lock-free — namespace by feature if a second lock ever
 * lands.
 */
export const ADVISORY_LOCK_SDE_INGEST = BigInt(8273619013);

/** `eve_data_meta` keys. Plain k/v table — see schema.ts. */
export const SDE_META_KEY_VERSION = 'sde_version';
/** SDE metadata key storing the deterministic blueprint-tree resolver source hash. */
export const SDE_META_KEY_TREE_HASH = 'tree_resolver_hash';

/**
 * Version token for the tree-resolver ALGORITHM, folded into the resolver
 * hash. The hash is otherwise derived from SDE row data, so a change to the
 * resolver's math (not the data) wouldn't invalidate it — the rebuild would
 * be skipped and stale flat materials would persist. Bump this whenever the
 * resolver's output for unchanged SDE data changes, so the next deploy/cron
 * rebuilds. History: 'v1' = whole-run rounding; 'v2-marginal' = fractional
 * (marginal) runs — 3.0.5.3; 'v3-published-producer' = producer selection
 * prefers published blueprints over unpublished test/dev artifacts (fixes the
 * Tungsten Carbide collision where the unpublished "Test Reaction Blueprint"
 * beat the real reaction formula and inflated T2 build cost ~500x).
 */
export const TREE_RESOLVER_ALGO_VERSION = 'v3-published-producer';

/**
 * --- Upwell structures + industry rigs (3.7.9) --------------------------
 * The three industry-capable structure families the planner offers as build
 * locations, by SDE group id (verified against the SDE — all sit under category
 * 65 "Structure"). A structure is just a build location: it bonuses each build
 * node BY THAT NODE'S ACTIVITY from the structure's own role attrs (if any) plus
 * whatever rigs physically fit it — there is no per-structure "role". Citadels
 * carry no role bonus of their own but DO host manufacturing rigs, so a Citadel +
 * a manufacturing rig still bonuses manufacturing nodes (the rig's bonus only).
 */
export const SDE_ENGINEERING_COMPLEX_GROUP_ID = 1404; // Raitaru / Azbel / Sotiyo
/** SDE group identifier shared by Athanor- and Tatara-class refinery structures. */
export const SDE_REFINERY_GROUP_ID = 1406; // Athanor / Tatara
/** SDE group identifier shared by Astrahus-, Fortizar-, and Keepstar-class citadels. */
export const SDE_CITADEL_GROUP_ID = 1657; // Astrahus / Fortizar / Keepstar (+ faction Fortizars)
/** The full offerable set: the three industry-capable structure groups. */
export const SDE_INDUSTRY_STRUCTURE_GROUP_IDS = [
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
  SDE_CITADEL_GROUP_ID,
] as const;
/** Structure rigs live under category 66 "Structure Module". */
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
export const STRUCTURE_RIG_SIZE_ATTR = 1547; // rig fits when this equals the structure's 1547
/**
 * Canonical SDE dogma attribute identifiers for rig can fit group.
 */
export const RIG_CAN_FIT_GROUP_ATTRS = [1298, 1299, 1300] as const; // canFitShipGroup01/02/03
/**
 * Canonical SDE dogma attribute identifier for rig mfg material.
 */
export const RIG_MFG_MATERIAL_ATTR = 2594; // nonzero ⇒ a manufacturing-efficiency rig
/**
 * Canonical SDE dogma attribute identifier for rig reaction time.
 */
export const RIG_REACTION_TIME_ATTR = 2713; // present ⇒ a reactor-efficiency rig

/**
 * --- Per-item manufacturing time skills (3.7.19.1; verified, source-cited) ---
 * Dogma attr 1982 `manufactureTimePerLevel` — a signed percent-per-level
 * manufacturing-time modifier carried by the ~22 T2/T3 science and Advanced
 * Ship Construction skills (−1 on all but Mutagenic Stabilization's −2). The
 * game applies it only to jobs whose blueprint's manufacturing activity
 * REQUIRES that skill: "1% reduction in manufacturing time for all items
 * requiring <skill> per level" (in-game descriptions; EVE Uni Skills:Production;
 * Qoi IndustryFormulas §1: skillModifier = Π(1 − 0.01·Level(k)); local SDE
 * type_dogma sweep 2026-07-09). Read from the ingested dogma, never hardcoded
 * per-skill — the VALUE ships with the SDE, only the attribute id is pinned.
 */
export const DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL = 1982;

/**
 * Revalidation tag for cached blueprint *structure* reads (the Industry
 * Planner's `'use cache'` tree + flat-materials view, and the blueprint search
 * index). `cacheLife('max')` already drops these on deploy, which covers the
 * deploy-time SDE ingest; the daily drift cron re-ingests WITHOUT a deploy, so
 * it busts this tag after re-running the tree resolver to keep warm structure
 * reads honest. Lives in eve-data (not the feature) so the SDE pipeline — which
 * is not governed by the feature/data import boundaries — can revalidate it
 * without a data → feature edge.
 */
export const BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure';
