import type { IndustryActivity } from './constants';

// Source-shaped rows before persistence. `updatedAt` is stamped by the ingest
// layer at write time (one timestamp per batch), so it isn't carried here.

/**
 * One system × activity cost index, flattened from ESI's nested
 * \{ solar_system_id, cost_indices: [\{ activity, cost_index \}] \} shape.
 */
export interface RawCostIndex {
  solarSystemId: number;
  activity: IndustryActivity;
  costIndex: number;
}

/**
 * One type's CCP adjusted price. `adjustedPrice` is nullable: NULL means the
 * field was absent in the ESI response; 0.0 is a real, distinct value.
 */
export interface RawAdjustedPrice {
  typeId: number;
  adjustedPrice: number | null;
}

/** A system's cost indices, keyed by activity — the query-layer return shape. */
export type SystemCostIndices = ReadonlyMap<IndustryActivity, number>;
