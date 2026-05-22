import { bigint, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const SITE_TYPES = ['combat', 'gas', 'ore', 'relic', 'data'] as const;
export type SiteType = typeof SITE_TYPES[number];

export const WORMHOLE_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type WormholeClass = typeof WORMHOLE_CLASSES[number];

// Raw labels from the Sheet's row-2 col-B "signature label".
// Kept distinct from `site_type` because the Sheet's wording is its own source of truth.
export const SIGNATURE_LABELS = [
  'Anomaly',
  'Relic Signature',
  'Data Signature',
  'Gas Signature',
  'Ore Signature',
] as const;
export type SignatureLabel = typeof SIGNATURE_LABELS[number];

// Observed trigger column values across all tabs. Stored as free text — see CLAUDE.md plan
// for why we don't lock these to a Postgres enum.
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

export const waves = pgTable(
  'waves',
  {
    id: serial('id').primaryKey(),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    waveNumber: integer('wave_number').notNull(),
    waveLabel: text('wave_label').notNull(),
    ewScram: integer('ew_scram'),
    ewWeb: integer('ew_web'),
    ewNeut: integer('ew_neut'),
    ewRrep: integer('ew_rrep'),
    dpsTotal: integer('dps_total'),
    alphaTotal: integer('alpha_total'),
    ehpTotal: integer('ehp_total'),
  },
  (t) => ({
    siteWaveUnique: uniqueIndex('waves_site_wave_number_unique').on(t.siteId, t.waveNumber),
  }),
);

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
    scram: integer('scram'),
    web: integer('web'),
    neut: integer('neut'),
    rrep: integer('rrep'),
    sig: integer('sig'),
    speed: integer('speed'),
    distance: integer('distance'),
    velocity: integer('velocity'),
    dps: integer('dps'),
    alpha: integer('alpha'),
    ehp: integer('ehp'),
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
  },
  (t) => ({
    siteOrderUnique: uniqueIndex('site_resources_site_order_unique').on(t.siteId, t.orderInSite),
  }),
);
