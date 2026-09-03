import type { IndustryActivity } from './constants';

export interface RawCostIndex {
  solarSystemId: number;
  activity: IndustryActivity;
  costIndex: number;
}

export interface RawAdjustedPrice {
  typeId: number;
  adjustedPrice: number | null;
}

export type SystemCostIndices = ReadonlyMap<IndustryActivity, number>;
