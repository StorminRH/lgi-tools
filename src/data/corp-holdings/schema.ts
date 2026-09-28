import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { ContainerRef, HangarDivision, HoldingNodeKind } from './placement';

export const corpHoldingNodes = pgTable(
  'corp_holding_nodes',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    itemId: bigint('item_id', { mode: 'number' }).notNull(),
    kind: text('kind').$type<HoldingNodeKind>().notNull(),
    rootId: bigint('root_id', { mode: 'number' }),
    division: integer('division').$type<HangarDivision>(),
    deliveries: boolean('deliveries').default(false).notNull(),
    containers: jsonb('containers').$type<ContainerRef[]>().default([]).notNull(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.itemId] })],
);

export const corpProfiles = pgTable('corp_profiles', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  hqStationId: bigint('hq_station_id', { mode: 'number' }),
  divisionNames: jsonb('division_names').$type<Partial<Record<HangarDivision, string>>>().notNull(),
  containerNames: jsonb('container_names').$type<Record<string, string>>().notNull(),
  structureNames: jsonb('structure_names').$type<Record<string, string>>().notNull(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
});

export const corpMemberBases = pgTable(
  'corp_member_bases',
  {
    characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    baseId: bigint('base_id', { mode: 'number' }),
  },
  (t) => [index('corp_member_bases_corporation_idx').on(t.corporationId)],
);
