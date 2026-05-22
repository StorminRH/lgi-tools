import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const SITE_TYPES = ['combat', 'gas', 'ore', 'relic', 'data'] as const;
export type SiteType = typeof SITE_TYPES[number];

export const WORMHOLE_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type WormholeClass = typeof WORMHOLE_CLASSES[number];

export const siteTypeEnum = pgEnum('site_type', SITE_TYPES);
export const wormholeClassEnum = pgEnum('wormhole_class', WORMHOLE_CLASSES);

export const sites = pgTable('sites', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  siteType: siteTypeEnum('site_type').notNull(),
  wormholeClass: wormholeClassEnum('wormhole_class').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
