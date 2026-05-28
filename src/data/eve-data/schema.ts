import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Eve Static Data Export (SDE) tables. Sourced from Fuzzwork's CSV dumps:
//   https://www.fuzzwork.co.uk/dump/latest/
// Primary keys are CCP's stable, externally-meaningful IDs — not `serial`.

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

// dgmTypeAttributes — every (typeId, attributeId) → value the SDE knows.
// ~600k rows. No FK to eveTypes: Fuzzwork ships rows for unpublished types too.
// `value` is doublePrecision because Fuzzwork stores everything in valueFloat
// (valueInt is always "None" in the dump), and some attrs are fractional
// (e.g. attr 70 = 0.0001444980038).
export const dgmTypeAttributes = pgTable(
  'dgm_type_attributes',
  {
    typeId: integer('type_id').notNull(),
    attributeId: integer('attribute_id').notNull(),
    value: doublePrecision('value').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.typeId, t.attributeId] }),
    typeIdIdx: index('dgm_type_attributes_type_id_idx').on(t.typeId),
  }),
);

// Industry tables. Source: Fuzzwork's `industryBlueprints.csv.bz2`,
// `industryActivity.csv.bz2`, `industryActivityMaterials.csv.bz2`,
// `industryActivityProducts.csv.bz2`. Truncate+refill on every SDE
// ingest; the SDE version stamp lives in `eveDataMeta` below.
//
// Activity IDs used downstream: 1 = manufacturing, 11 = reactions.
// Invention (8), copying (5), research (3, 4) are ingested verbatim
// but ignored by the tree resolver per design-doc non-goals.
//
// No FKs to `eve_types` from the industry tables — same gotcha as
// dgm_type_attributes: Fuzzwork's industry CSVs reference type IDs
// that aren't in the published invTypes dump (rare unpublished /
// retired-but-referenced items). The application invariant is that
// the ingest is internally consistent (always streams ALL four CSVs
// in one transaction from the same Fuzzwork dump), so dangling type
// IDs cause `getTypesByIds` to return short maps, not orphaned rows.

export const industryBlueprints = pgTable('industry_blueprints', {
  blueprintTypeId: integer('blueprint_type_id').primaryKey(),
  maxProductionLimit: integer('max_production_limit').notNull(),
});

export const industryActivities = pgTable(
  'industry_activities',
  {
    blueprintTypeId: integer('blueprint_type_id')
      .notNull()
      .references(() => industryBlueprints.blueprintTypeId, {
        onDelete: 'cascade',
      }),
    activityId: integer('activity_id').notNull(),
    timeSeconds: integer('time_seconds').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blueprintTypeId, t.activityId] }),
  }),
);

export const industryActivityMaterials = pgTable(
  'industry_activity_materials',
  {
    blueprintTypeId: integer('blueprint_type_id').notNull(),
    activityId: integer('activity_id').notNull(),
    materialTypeId: integer('material_type_id').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.blueprintTypeId, t.activityId, t.materialTypeId],
    }),
    activityFk: foreignKey({
      columns: [t.blueprintTypeId, t.activityId],
      foreignColumns: [
        industryActivities.blueprintTypeId,
        industryActivities.activityId,
      ],
    }).onDelete('cascade'),
    materialIdx: index('industry_activity_materials_material_idx').on(
      t.materialTypeId,
    ),
  }),
);

export const industryActivityProducts = pgTable(
  'industry_activity_products',
  {
    blueprintTypeId: integer('blueprint_type_id').notNull(),
    activityId: integer('activity_id').notNull(),
    productTypeId: integer('product_type_id').notNull(),
    quantity: integer('quantity').notNull(),
    probability: doublePrecision('probability'),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.blueprintTypeId, t.activityId, t.productTypeId],
    }),
    activityFk: foreignKey({
      columns: [t.blueprintTypeId, t.activityId],
      foreignColumns: [
        industryActivities.blueprintTypeId,
        industryActivities.activityId,
      ],
    }).onDelete('cascade'),
    productIdx: index('industry_activity_products_product_idx').on(t.productTypeId),
  }),
);

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
