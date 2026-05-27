import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
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
