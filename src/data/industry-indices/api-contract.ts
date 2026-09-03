export type CronRefreshIndustryIndicesResponse =
  | { status: 'busy' }
  | {
      status: 'refreshed';
      costIndices: { ok: boolean; written: number };
      adjustedPrices: { ok: boolean; written: number };
    };
