import { eq, inArray, sql } from 'drizzle-orm';
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
      .onConflictDoUpdate({
        target: whObservations.dedupeKey,
        set: {
          solarSystemId: excluded(whObservations.solarSystemId.name),
          whTypeCode: excluded(whObservations.whTypeCode.name),
          provenance: excluded(whObservations.provenance.name),
          observedAt: excluded(whObservations.observedAt.name),
        },
      });
  }
  if (reconcile.deleteKeys.length > 0) {
    await database
      .delete(whObservations)
      .where(inArray(whObservations.dedupeKey, [...reconcile.deleteKeys]));
  }
}
