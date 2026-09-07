import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import type { AnyPgDb } from '@/lib/db-types';
import { whObservations } from './schema';

export interface WhObservationInput {
  readonly solarSystemId: number;
  readonly whTypeCode: string;
  readonly provenance: ConnectionProvenance;
  readonly observedAt: Date;
  readonly dedupeKey: string;
}

export interface WhObservationReconcile {
  readonly upserts: readonly WhObservationInput[];
  readonly deleteKeys: readonly string[];
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

function observationConflict(): {
  readonly target: typeof whObservations.dedupeKey;
  readonly set: {
    readonly solarSystemId: SQL;
    readonly whTypeCode: SQL;
    readonly provenance: SQL;
    readonly observedAt: SQL;
  };
  readonly setWhere: SQL;
} {
  const solarSystemId = excluded(whObservations.solarSystemId.name);
  const whTypeCode = excluded(whObservations.whTypeCode.name);
  const provenance = excluded(whObservations.provenance.name);
  const observedAt = excluded(whObservations.observedAt.name);
  return {
    target: whObservations.dedupeKey,
    set: { solarSystemId, whTypeCode, provenance, observedAt },
    setWhere: sql`(
      ${whObservations.solarSystemId} is distinct from ${solarSystemId}
      or ${whObservations.whTypeCode} is distinct from ${whTypeCode}
      or ${whObservations.provenance} is distinct from ${provenance}
      or ${whObservations.observedAt} is distinct from ${observedAt}
    )`,
  };
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

function toObservationHour(value: Date): Date {
  const observedAt = new Date(value);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('Wormhole observation requires a valid timestamp.');
  }
  observedAt.setUTCMinutes(0, 0, 0);
  return observedAt;
}

export async function deleteWhObservation(
  database: AnyPgDb,
  dedupeKey: string,
): Promise<void> {
  await database
    .delete(whObservations)
    .where(eq(whObservations.dedupeKey, dedupeKey));
}

export async function insertWhObservation(
  database: AnyPgDb,
  input: WhObservationInput,
): Promise<typeof whObservations.$inferSelect | null> {
  assertObservationInput(input);
  const [stored] = await database
    .insert(whObservations)
    .values({ ...input, observedAt: toObservationHour(input.observedAt) })
    .onConflictDoUpdate(observationConflict())
    .returning();
  return stored ?? null;
}

export async function reconcileWhObservations(
  database: AnyPgDb,
  reconcile: WhObservationReconcile,
): Promise<void> {
  if (reconcile.upserts.length > 0) {
    for (const input of reconcile.upserts) assertObservationInput(input);
    await database
      .insert(whObservations)
      .values(
        reconcile.upserts.map((input) => ({
          ...input,
          observedAt: toObservationHour(input.observedAt),
        })),
      )
      .onConflictDoUpdate(observationConflict());
  }
  if (reconcile.deleteKeys.length > 0) {
    await database
      .delete(whObservations)
      .where(inArray(whObservations.dedupeKey, [...reconcile.deleteKeys]));
  }
}
