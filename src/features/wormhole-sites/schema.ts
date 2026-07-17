import { bigint, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const SITE_TYPES = ['combat', 'gas', 'ore', 'relic', 'data'] as const;
export type SiteType = typeof SITE_TYPES[number];

export const WORMHOLE_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type WormholeClass = typeof WORMHOLE_CLASSES[number];

/**
 * Raw labels from the Sheet's row-2 col-B "signature label".
 * Kept distinct from `site_type` because the Sheet's wording is its own source of truth.
 */
export const SIGNATURE_LABELS = [
  'Anomaly',
  'Relic Signature',
  'Data Signature',
  'Gas Signature',
  'Ore Signature',
] as const;
export type SignatureLabel = typeof SIGNATURE_LABELS[number];

/**
 * Observed trigger column values across all tabs. Stored as free text, not locked to a
 * Postgres enum.
 */
export const TRIGGER_LABELS = [
  'Trigger',
  'Opt',
  'DTA',
  '1st Death Trigger',
  'Opt?',
  'Trigger on Attack',
] as const;
export type TriggerLabel = typeof TRIGGER_LABELS[number];

export const SLEEPER_CLASS_CODES = ['F', 'C', 'B', 'T'] as const;
export type SleeperClassCode = typeof SLEEPER_CLASS_CODES[number];

/** Narrow a raw class string (e.g. an NPC's stored code) to a known hull class. */
export function isSleeperClassCode(code: string): code is SleeperClassCode {
  return (SLEEPER_CLASS_CODES as readonly string[]).includes(code);
}

export const siteTypeEnum = pgEnum('site_type', SITE_TYPES);
export const wormholeClassEnum = pgEnum('wormhole_class', WORMHOLE_CLASSES);

export const sites = pgTable(
  'sites',
  {
    id: serial('id').primaryKey(),
    sourceTab: text('source_tab').notNull(),
    name: text('name').notNull(),
    siteType: siteTypeEnum('site_type').notNull(),
    signatureLabel: text('signature_label').notNull(),
    wormholeClass: wormholeClassEnum('wormhole_class'),
    blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
    iskPerEhp: integer('isk_per_ehp'),
    resourceValueIsk: bigint('resource_value_isk', { mode: 'number' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    sourceNameUnique: uniqueIndex('sites_source_tab_name_unique').on(t.sourceTab, t.name),
  }),
);

/**
 * Wave aggregates (DPS / alpha / EHP totals, EWAR counts) are recomputed
 * live in queries.ts via the npc-stats summariseWave helper as of 2.7.1.
 * The columns that used to cache them are dropped in drizzle/0009.
 */
export const waves = pgTable(
  'waves',
  {
    id: serial('id').primaryKey(),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    waveNumber: integer('wave_number').notNull(),
    waveLabel: text('wave_label').notNull(),
  },
  (t) => ({
    siteWaveUnique: uniqueIndex('waves_site_wave_number_unique').on(t.siteId, t.waveNumber),
  }),
);

/**
 * Per-NPC combat stats (dps, alpha, ehp, scram, web, neut, rrep, sig, speed,
 * distance, velocity) are computed live from raw EVE SDE attributes via
 * src/data/npc-stats as of 2.7.1. The columns that used to cache them are
 * dropped in drizzle/0009. `type_id` is the new join key.
 */
export const npcs = pgTable(
  'npcs',
  {
    id: serial('id').primaryKey(),
    waveId: integer('wave_id')
      .notNull()
      .references(() => waves.id, { onDelete: 'cascade' }),
    orderInWave: integer('order_in_wave').notNull(),
    triggerLabel: text('trigger_label'),
    quantity: integer('quantity').notNull(),
    sleeperName: text('sleeper_name').notNull(),
    sleeperClassCode: text('sleeper_class_code').notNull(),
    typeId: integer('type_id').notNull(),
  },
  (t) => ({
    waveOrderUnique: uniqueIndex('npcs_wave_order_unique').on(t.waveId, t.orderInWave),
  }),
);

export const siteResources = pgTable(
  'site_resources',
  {
    id: serial('id').primaryKey(),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    orderInSite: integer('order_in_site').notNull(),
    resourceKind: text('resource_kind').notNull(),
    resourceName: text('resource_name').notNull(),
    units: bigint('units', { mode: 'number' }),
    volumeM3: bigint('volume_m3', { mode: 'number' }),
    iskPerM3: integer('isk_per_m3'),
    totalIsk: bigint('total_isk', { mode: 'number' }),
    // Resolved at sheet-ingest time via a strict resource-name → SDE type
    // alias map. NULL when the sheet name isn't in the map — the row then
    // renders its sheet totalIsk unchanged (the fallback).
    typeId: integer('type_id'),
  },
  (t) => ({
    siteOrderUnique: uniqueIndex('site_resources_site_order_unique').on(t.siteId, t.orderInSite),
  }),
);

/**
 * Escalation spawns — C5/C6 specials (Drifter Response/Recon BS, Upgraded
 * Avenger). One row per escalation type. These don't belong on the
 * wave/npc tables because their spawn rules and HP-by-layer breakdown
 * are unique. Resists stored as 0–100 integers; web stored signed.
 */
export const escalations = pgTable('escalations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  typeId: integer('type_id'),
  classScope: text('class_scope').notNull(),
  triggerNotes: text('trigger_notes').notNull(),
  blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
  iskPerEhpMin: integer('isk_per_ehp_min'),
  iskPerEhpMax: integer('isk_per_ehp_max'),
  shieldHp: bigint('shield_hp', { mode: 'number' }),
  shieldResEm: integer('shield_res_em'),
  shieldResExp: integer('shield_res_exp'),
  shieldResKin: integer('shield_res_kin'),
  shieldResTherm: integer('shield_res_therm'),
  armorHp: bigint('armor_hp', { mode: 'number' }),
  armorResEm: integer('armor_res_em'),
  armorResExp: integer('armor_res_exp'),
  armorResKin: integer('armor_res_kin'),
  armorResTherm: integer('armor_res_therm'),
  structureHp: bigint('structure_hp', { mode: 'number' }),
  ehpMin: bigint('ehp_min', { mode: 'number' }),
  ehpMax: bigint('ehp_max', { mode: 'number' }),
  dps: integer('dps'),
  sig: integer('sig'),
  speed: integer('speed'),
  distance: integer('distance'),
  velocity: integer('velocity'),
  scram: integer('scram'),
  web: integer('web'),
  neut: integer('neut'),
  rrep: integer('rrep'),
});

// `sleeperArchetypes` was dropped in drizzle/0009. Combat stats are now
// computed live in src/data/npc-stats from raw EVE SDE attributes. The
// historical archetype snapshot lives on as the input fixture for
// src/data/npc-stats/math.test.ts (see src/data/npc-stats/__fixtures__/).
