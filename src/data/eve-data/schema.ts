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

// dgmAttributeTypes — metadata for every SDE attribute (id → name, unit).
// ~3000 rows. No FK to anything; standalone lookup table.
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

// typeDogma — every type's dogma attributes, one JSONB row per type, mirroring
// CCP's `typeDogma.jsonl` record (`{ _key: typeID, dogmaAttributes: [...] }`).
// The `attributes` object is `{ [attributeId]: value }` — CCP's array folded to a
// map at ingest, which is exactly the shape getTypeAttributesBatch returns. No FK
// to eveTypes: CCP ships dogma for unpublished types too. Values are JSON numbers
// (some attrs are fractional, e.g. attr 70 = 0.0001444980038).
export const typeDogma = pgTable('type_dogma', {
  typeId: integer('type_id').primaryKey(),
  attributes: jsonb('attributes').notNull(),
});

// Industry blueprints — one JSONB document per blueprint, mirroring CCP's
// `blueprints.jsonl` record. `activities` holds CCP's whole nested object verbatim
// (string-keyed: `manufacturing`, `reaction`, `invention`, `copying`,
// `research_material`, `research_time`), each activity carrying a subset of
// `materials[]`, `products[]`, `skills[]`, `time`. Truncate+refill on every SDE
// ingest; the SDE version stamp lives in `eveDataMeta` below.
//
// Activity IDs used downstream: 1 = manufacturing, 11 = reactions (the resolver +
// planner read those two; ACTIVITY_NAME_TO_ID in constants.ts maps CCP's string
// keys to the numeric IDs). Invention/copying/research are stored verbatim inside
// the JSON but ignored by the resolver per design-doc non-goals.
//
// No FK from the JSON's type IDs to `eve_types` — CCP's blueprints reference type
// IDs that aren't in the published types set (rare unpublished / retired-but-
// referenced items). The ingest is internally consistent (one transaction from
// one CCP dump), so dangling type IDs cause `getTypesByIds` to return short maps,
// not orphaned rows.
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

// Key/value metadata for the eve-data slice. Two keys live here today:
//   `sde_version` — Fuzzwork's `Last-Modified` header on `invTypes.csv.bz2`,
//                   used by the weekly drift cron to decide when CCP has
//                   patched the SDE.
//   `tree_resolver_hash` — content hash of the industry tables, used by
//                   the resolver to skip its expensive pass when nothing
//                   downstream of it has changed.
// New keys can be added without a migration; the table is plain k/v.
export const eveDataMeta = pgTable('eve_data_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
