import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { CONNECTION_PROVENANCES } from '@/data/eve-data/wormhole-contract';

/** Drizzle owner of the provenance vocabulary shared with connection identity facts. */
export const whObservationProvenanceEnum = pgEnum(
  'wh_observation_provenance',
  CONNECTION_PROVENANCES,
);

/**
 * Privacy-safe D16 observation corpus. The five fields deliberately exclude map, user,
 * character, and destination identity; one per-hole-lifetime key is corrected in place.
 */
export const whObservations = pgTable(
  'wh_observations',
  {
    solarSystemId: bigint('solar_system_id', { mode: 'number' }).notNull(),
    whTypeCode: varchar('wh_type_code', { length: 4 }).notNull(),
    provenance: whObservationProvenanceEnum('provenance').notNull(),
    observedAt: timestamp('observed_at', {
      mode: 'date',
      withTimezone: true,
      precision: 0,
    }).notNull(),
    dedupeKey: text('dedupe_key')
      .notNull()
      .unique('wh_observations_dedupe_key_unique'),
  },
  (table) => [
    check(
      'wh_observations_attributable_type',
      sql`${table.whTypeCode} <> 'K162'`,
    ),
    check(
      'wh_observations_verified_provenance',
      sql`${table.provenance} <> 'assumed'`,
    ),
    check(
      'wh_observations_hour_coarse',
      sql`${table.observedAt} = date_trunc('hour', ${table.observedAt})`,
    ),
  ],
);
