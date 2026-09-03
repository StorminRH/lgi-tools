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

export const eveStationOperations = pgTable('eve_station_operations', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

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

export const eveDataMeta = pgTable('eve_data_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
