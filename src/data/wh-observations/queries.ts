import { eq, sql } from 'drizzle-orm';
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import type { AnyPgDb } from '@/lib/db-types';
import { whObservations } from './schema';

/** The complete privacy-safe input for one corrected-in-place D16 observation. */
export interface WhObservationInput {
  readonly solarSystemId: number;
  readonly whTypeCode: string;
  /** Every connection tier is admitted; `assumed` marks a machine deduction (D-B). */
  readonly provenance: ConnectionProvenance;
  readonly observedAt: Date;
  readonly dedupeKey: string;
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

function validSolarSystemId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function attributableTypeCode(value: string): boolean {
  return isWormholeTypeCode(value) && value !== FAR_SIDE_WORMHOLE_CODE;
}

function assertObservationInput(input: WhObservationInput): void {
  if (!validSolarSystemId(input.solarSystemId)) {
    throw new Error('Wormhole observation requires a valid solar-system id.');
  }
  if (!attributableTypeCode(input.whTypeCode)) {
    throw new Error('Wormhole observation requires an attributable type code.');
  }
  if (input.dedupeKey.trim() === '') {
    throw new Error('Wormhole observation requires a dedupe key.');
  }
}

/** Returns a new Date truncated to its UTC hour without mutating the caller's value. */
export function toObservationHour(value: Date): Date {
  const observedAt = new Date(value);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('Wormhole observation requires a valid timestamp.');
  }
  observedAt.setUTCMinutes(0, 0, 0);
  return observedAt;
}

/**
 * Deletes the observation carrying a dedupe key. Used when a correction moves
 * a hole's identity onto a target the emission guard rejects (untyped, K162,
 * class-contradicted) — the previously emitted row would otherwise keep
 * asserting the vacated identity with no repair pathway. Absent key: no-op.
 */
export async function deleteWhObservation(
  database: AnyPgDb,
  dedupeKey: string,
): Promise<void> {
  await database
    .delete(whObservations)
    .where(eq(whObservations.dedupeKey, dedupeKey));
}

/**
 * Inserts one D16 observation or replaces its attributable facts when the same
 * per-hole-lifetime dedupe key is corrected later.
 */
export async function insertWhObservation(
  database: AnyPgDb,
  input: WhObservationInput,
): Promise<typeof whObservations.$inferSelect> {
  assertObservationInput(input);
  const [stored] = await database
    .insert(whObservations)
    .values({ ...input, observedAt: toObservationHour(input.observedAt) })
    .onConflictDoUpdate({
      target: whObservations.dedupeKey,
      set: {
        solarSystemId: excluded(whObservations.solarSystemId.name),
        whTypeCode: excluded(whObservations.whTypeCode.name),
        provenance: excluded(whObservations.provenance.name),
        observedAt: excluded(whObservations.observedAt.name),
      },
    })
    .returning();
  if (stored === undefined) {
    throw new Error('Wormhole observation upsert returned no row.');
  }
  return stored;
}
