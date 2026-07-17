import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Eve Static Data Export (SDE) tables. Sourced from CCP's first-party SDE,
// published straight from the Tranquility build pipeline as one zip of `.jsonl`
// files (https://developers.eveonline.com/static-data). The tables are shaped to
// CCP's native records rather than a flat per-table remap: a blueprint's whole
// nested `activities` object and a type's whole dogma-attribute list each land in
// one JSONB column. Primary keys are CCP's stable, externally-meaningful IDs
// (the JSONL `_key`) — not `serial`.

export const eveCategories = pgTable('eve_categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  iconId: integer('icon_id'),
  published: boolean('published').notNull(),
});

export const eveGroups = pgTable('eve_groups', {
  id: integer('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => eveCategories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  iconId: integer('icon_id'),
  useBasePrice: boolean('use_base_price').notNull(),
  anchored: boolean('anchored').notNull(),
  anchorable: boolean('anchorable').notNull(),
  fittableNonSingleton: boolean('fittable_non_singleton').notNull(),
  published: boolean('published').notNull(),
});

export const eveTypes = pgTable(
  'eve_types',
  {
    id: integer('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => eveGroups.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    mass: doublePrecision('mass'),
    volume: doublePrecision('volume'),
    capacity: doublePrecision('capacity'),
    portionSize: integer('portion_size'),
    raceId: integer('race_id'),
    basePrice: bigint('base_price', { mode: 'number' }),
    published: boolean('published').notNull(),
    marketGroupId: integer('market_group_id'),
    iconId: integer('icon_id'),
    soundId: integer('sound_id'),
    graphicId: integer('graphic_id'),
  },
  (t) => ({
    nameLowerIdx: index('eve_types_name_lower_idx').on(sql`lower(${t.name})`),
  }),
);

/**
 * dgmAttributeTypes — metadata for every SDE attribute (id → name, unit).
 * ~3000 rows. No FK to anything; standalone lookup table.
 */
export const dgmAttributeTypes = pgTable('dgm_attribute_types', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  iconId: integer('icon_id'),
  defaultValue: doublePrecision('default_value'),
  published: boolean('published').notNull(),
  displayName: text('display_name'),
  unitId: integer('unit_id'),
  stackable: boolean('stackable').notNull(),
  highIsGood: boolean('high_is_good').notNull(),
  categoryId: integer('category_id'),
});

/**
 * typeDogma — every type's dogma attributes, one JSONB row per type, mirroring
 * CCP's `typeDogma.jsonl` record (`{ _key: typeID, dogmaAttributes: [...] }`).
 * The `attributes` object is `{ [attributeId]: value }` — CCP's array folded to a
 * map at ingest, which is exactly the shape getTypeAttributesBatch returns. No FK
 * to eveTypes: CCP ships dogma for unpublished types too. Values are JSON numbers
 * (some attrs are fractional, e.g. attr 70 = 0.0001444980038).
 */
export const typeDogma = pgTable('type_dogma', {
  typeId: integer('type_id').primaryKey(),
  attributes: jsonb('attributes').notNull(),
});

/**
 * Industry blueprints — one JSONB document per blueprint, mirroring CCP's
 * `blueprints.jsonl` record. `activities` holds CCP's whole nested object verbatim
 * (string-keyed: `manufacturing`, `reaction`, `invention`, `copying`,
 * `research_material`, `research_time`), each activity carrying a subset of
 * `materials[]`, `products[]`, `skills[]`, `time`. Truncate+refill on every SDE
 * ingest; the SDE version stamp lives in `eveDataMeta` below.
 *
 * Activity IDs used downstream: 1 = manufacturing, 11 = reactions (the resolver +
 * planner read those two; ACTIVITY_NAME_TO_ID in constants.ts maps CCP's string
 * keys to the numeric IDs). Invention/copying/research are stored verbatim inside
 * the JSON but ignored by the resolver per design-doc non-goals.
 *
 * No FK from the JSON's type IDs to `eve_types` — CCP's blueprints reference type
 * IDs that aren't in the published types set (rare unpublished / retired-but-
 * referenced items). The ingest is internally consistent (one transaction from
 * one CCP dump), so dangling type IDs cause `getTypesByIds` to return short maps,
 * not orphaned rows.
 */
export const industryBlueprints = pgTable('industry_blueprints', {
  blueprintTypeId: integer('blueprint_type_id').primaryKey(),
  maxProductionLimit: integer('max_production_limit').notNull(),
  activities: jsonb('activities').notNull(),
});

// Computed by the tree resolver after each successful SDE ingest. Both
// tables are wiped + repopulated together; idempotency is gated on the
// `tree_resolver_hash` row in `eveDataMeta`.

export const blueprintTrees = pgTable('blueprint_trees', {
  blueprintTypeId: integer('blueprint_type_id')
    .primaryKey()
    .references(() => industryBlueprints.blueprintTypeId, {
      onDelete: 'cascade',
    }),
  treeJson: jsonb('tree_json').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
});

export const blueprintFlatMaterials = pgTable(
  'blueprint_flat_materials',
  {
    blueprintTypeId: integer('blueprint_type_id')
      .notNull()
      .references(() => industryBlueprints.blueprintTypeId, {
        onDelete: 'cascade',
      }),
    rawMaterialTypeId: integer('raw_material_type_id').notNull(),
    totalQuantity: bigint('total_quantity', { mode: 'bigint' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blueprintTypeId, t.rawMaterialTypeId] }),
    blueprintIdx: index('blueprint_flat_materials_blueprint_idx').on(
      t.blueprintTypeId,
    ),
  }),
);

// ===========================================================================
// Universe (map + NPC station) data. Sourced from CCP's `map*` / `npcStations`
// / `stationOperations` / `stationServices` JSONL files (3.5.1a; widened to the
// full persistent universe in 3.7.2.2). Covers every PERSISTENT New Eden system —
// K-space + Pochven + J-space (wormhole) — plus the static stargate jump graph.
// Instanced abyssal deadspace and the special/non-standard regions (regionID ≥
// 12M) stay excluded. The richer mapper attribute layer (per-WH statics +
// environmental effects, sourced from anoik.is) is NOT here — it attaches later
// via a related table; only the coarse first-party SDE class lives on the system
// row. Region/constellation aren't on a station's base record; they derive by
// joining up through `solarSystemID` (a system row carries both). FKs follow the
// category→group→type hierarchy convention above.
// ===========================================================================

export const eveRegions = pgTable('eve_regions', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

export const eveConstellations = pgTable(
  'eve_constellations',
  {
    id: integer('id').primaryKey(),
    regionId: integer('region_id')
      .notNull()
      .references(() => eveRegions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
  },
  (t) => ({
    regionIdx: index('eve_constellations_region_idx').on(t.regionId),
  }),
);

/**
 * `region_id` is carried straight from CCP's `mapSolarSystems` record (it ships
 * both `constellationID` and `regionID`), so the common "systems in region"
 * query skips the constellation hop. `security_status` is a real number
 * (−1.0..1.0) — it MUST be doublePrecision; truncating it to an int would
 * collapse the hi/low/null-sec distinction.
 *
 * `wormhole_class_id` is CCP's first-party location class, derived most-specific
 * (system → constellation → region) at ingest: 1–6 = C1–C6 wormholes, 7/8/9 =
 * hi/low/null K-space, 12 = Thera, 13 = shattered, 14–18 = Drifter (Sentinel /
 * Barbican / Vidette / Conflux / Redoubt), 25 = Pochven. Nullable: a handful of
 * untagged hi-sec K-space systems carry no class in the SDE (their band is
 * sec-status-derivable anyway). For J-space it is always present. This is the
 * COARSE class only — anoik.is statics/effects are the separate v4.0 layer.
 */
export const eveSolarSystems = pgTable(
  'eve_solar_systems',
  {
    id: integer('id').primaryKey(),
    constellationId: integer('constellation_id')
      .notNull()
      .references(() => eveConstellations.id, { onDelete: 'restrict' }),
    regionId: integer('region_id')
      .notNull()
      .references(() => eveRegions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    securityStatus: doublePrecision('security_status'),
    wormholeClassId: integer('wormhole_class_id'),
  },
  (t) => ({
    constellationIdx: index('eve_solar_systems_constellation_idx').on(
      t.constellationId,
    ),
    regionIdx: index('eve_solar_systems_region_idx').on(t.regionId),
  }),
);

/**
 * Station operations — the 68-row lookup naming each operation. The per-station
 * industry capability is derived from this operation's `services[]` at ingest
 * (see universe.ts) and denormalized onto the station rows below; this table
 * keeps only `id`/`name` (the source for a station's display label).
 */
export const eveStationOperations = pgTable('eve_station_operations', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

/**
 * NPC stations. CCP's SDE record has no name and no celestial reference (the
 * "Jita IV - Moon 4 - Caldari Navy Assembly Plant" string is composed in-client
 * from owner + operation + the station's planet/moon), and we ingest neither the
 * owner corporations nor the map celestials. So the full `name` is resolved
 * separately, post-ingest, from ESI's /universe/names/ (see station-names.ts) —
 * nullable because that step is best-effort: a flaky ESI leaves it null and the
 * planner falls back to the operation label. No region/constellation (join up
 * through `solar_system_id`). The three capability booleans are resolved at
 * ingest via the three-file join npcStations.operationID →
 * stationOperations.services[] → stationServices, so "industry-capable stations
 * in system X" is one indexed query with no join. `type_id` (station hull) and
 * `owner_id` (NPC corp) are plain ints, NOT FKs: `type_id` follows the standing
 * no-FK-to-eve_types note above, and npcCorporations isn't ingested.
 */
export const eveNpcStations = pgTable(
  'eve_npc_stations',
  {
    id: integer('id').primaryKey(),
    solarSystemId: integer('solar_system_id')
      .notNull()
      .references(() => eveSolarSystems.id, { onDelete: 'restrict' }),
    operationId: integer('operation_id')
      .notNull()
      .references(() => eveStationOperations.id, { onDelete: 'restrict' }),
    typeId: integer('type_id').notNull(),
    ownerId: integer('owner_id').notNull(),
    // Full in-game station name, resolved from ESI after ingest. Null until
    // resolved (or if resolution failed) — display falls back to the operation.
    name: text('name'),
    manufacturingCapable: boolean('manufacturing_capable').notNull(),
    researchCapable: boolean('research_capable').notNull(),
    industryCapable: boolean('industry_capable').notNull(),
  },
  (t) => ({
    solarSystemIdx: index('eve_npc_stations_solar_system_idx').on(
      t.solarSystemId,
    ),
    operationIdx: index('eve_npc_stations_operation_idx').on(t.operationId),
  }),
);

/**
 * Static stargate topology as a derived system↔system jump graph (3.7.2.2). Each
 * CCP stargate record already carries both endpoints (its own `solarSystemID` and
 * `destination.solarSystemID`), so a gate becomes one directed edge with no
 * gate→gate resolution; an undirected jump is the two reciprocal edges. Only the
 * adjacency is stored — gate ids/positions aren't kept, because the one consumer
 * (route adjacency for the mapper) needs neighbours, not gate geometry. J-space
 * has no static gates, so every row connects K-space/Pochven systems. The
 * composite PK `(from, to)` also serves the from-prefix "neighbours of X" lookup,
 * so no separate index is needed.
 */
export const eveSystemJumps = pgTable(
  'eve_system_jumps',
  {
    fromSystemId: integer('from_system_id')
      .notNull()
      .references(() => eveSolarSystems.id, { onDelete: 'restrict' }),
    toSystemId: integer('to_system_id')
      .notNull()
      .references(() => eveSolarSystems.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fromSystemId, t.toSystemId] }),
  }),
);

/**
 * Key/value metadata for the eve-data slice. Two keys live here today:
 *   `sde_version` — Fuzzwork's `Last-Modified` header on `invTypes.csv.bz2`,
 *                   used by the daily drift cron to decide when CCP has
 *                   patched the SDE.
 *   `tree_resolver_hash` — content hash of the industry tables, used by
 *                   the resolver to skip its expensive pass when nothing
 *                   downstream of it has changed.
 * New keys can be added without a migration; the table is plain k/v.
 */
export const eveDataMeta = pgTable('eve_data_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
