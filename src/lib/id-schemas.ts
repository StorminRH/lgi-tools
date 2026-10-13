import { z } from 'zod';

/** Postgres `integer` (int4) and `serial` upper bound. */
const PG_INT4_MAX = 2_147_483_647;
const OWNED_ROW_ID_MAX = 100;

/**
 * A positive safe integer id: character, corporation, alliance, structure and
 * item ids (bigint columns, Convex numbers). zod 4 `.int()` is already bounded
 * to safe integers, so no `.safe()`.
 */
export const positiveIdSchema = z.number().int().positive();

/** A Postgres integer or serial id: type, system, blueprint and site rows. */
export const int4IdSchema = positiveIdSchema.max(PG_INT4_MAX);

/**
 * A numeric route segment: digits only with no sign, leading zero, exponent,
 * hex or whitespace, bounded to int4. Use it only inside endpoint `params`,
 * since its input is a string and its output a number.
 */
export const pathIdParamSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(int4IdSchema);

/**
 * A user-owned row's text id (custom structures, saved plans, industry
 * profiles). New rows get `randomUUID()`, but the column is text, so the bound
 * stays loose and older ids stay addressable.
 */
export const ownedRowIdSchema = z.string().min(1).max(OWNED_ROW_ID_MAX);

/** The runtime check behind `positiveIdSchema`, for values that are not ids too (timestamps, revisions). */
export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
