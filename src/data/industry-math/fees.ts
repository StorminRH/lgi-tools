// Pure fee math for the Industry Planner: gross margin → net margin.
//
// Same dependency-free leaf discipline as profitability.ts — this module imports
// nothing from another slice. Callers (the industry-planner feature, 3.5.2b)
// adapt their industry-indices rows into these plain inputs, the same PriceOf
// pattern: an `adjustedPriceOf` lookup and a plain `systemCostIndex` number.
//
// Net margin subtracts two fee groups from the gross margin computed in
// profitability.ts:
//   1. the EVE industry job-installation fee (a build-side cost), and
//   2. the sell-side trading fees (sales tax + broker fee).
//
// Null-propagation honesty matches the sibling leaf: a missing input is FLAGGED,
// never silently zeroed; a value we genuinely don't know is null, while values
// we do know stay visible.
//
// Cost assumption: ME 0 (un-reduced blueprint quantities), shared with the build
// path (the resolver and computeBatchMaterials are ME0 throughout). EIV is
// always defined at ME0 regardless of a job's actual ME.

import { computeMargin, type MarginInput, type MaterialQty } from './profitability';

// EVE fee rates, all fractions. Defaults model the case this version ships:
// an NPC station, ME0, Omega clone, manufacturing job with no structure bonuses,
// and sell-side defaults with NO Accounting / Broker Relations skills or
// standings. Each sell-side rate is a clearly-labeled BASE-RATE ASSUMPTION; a
// future per-user override (or a reaction/research consumer with a different SCC)
// slots in by passing a different FeeRates — no rework.
//
// Rates verified against current EVE/ESI documentation 2026-06 (CCP changes
// these; see the per-field provenance):
//   facilityTax  0.25% — NPC station, Viridian 2023-06
//   sccSurcharge 4%    — manufacturing, raised 0.75%→1.5%→4% in Version 21.06 (2024-06)
//   salesTax     7.5%  — base before Accounting, raised in Version 22.02 (2025-03-12)
//   brokerFee    3%    — NPC station base before Broker Relations / standings
// (Alpha clone tax 0.25% applies only to Alpha clones — we model Omega, so 0.)
export interface FeeRates {
  facilityTax: number; // fraction of EIV
  sccSurcharge: number; // fraction of EIV
  salesTax: number; // fraction of sell revenue (base assumption)
  brokerFee: number; // fraction of sell revenue (base assumption)
}

export const DEFAULT_FEE_RATES: FeeRates = {
  facilityTax: 0.0025,
  sccSurcharge: 0.04,
  salesTax: 0.075,
  brokerFee: 0.03,
};

// CCP "adjusted price" for a type, or null when there's no usable adjusted price
// (no row, or a stored NULL — the absent-vs-0.0 distinction the adjusted_prices
// table preserves). Mirrors PriceOf, but a single number per type. A returned 0
// is a real, known price, NOT "missing".
export type AdjustedPriceOf = (typeId: number) => number | null;

export interface JobInstallationFee {
  // Σ baseQty × adjustedPrice over the ME0 base materials. A partial sum (missing
  // adjusted prices contribute 0 and are flagged), never null — the honest base
  // for the EIV-only fee lines below.
  estimatedItemValue: number;
  // EIV × systemCostIndex (the per-system "system cost"). Null when the system
  // has no stored cost index, the one component that needs the index.
  jobGrossCost: number | null;
  facilityTax: number; // EIV × rate — EIV-only, always known
  sccSurcharge: number; // EIV × rate — EIV-only, always known
  // jobGrossCost + facilityTax + sccSurcharge. Null iff jobGrossCost is null
  // (the fee can't be completed without the index). facilityTax + sccSurcharge
  // stay individually visible so callers read the honest partial rather than
  // coalescing `total ?? 0` and silently dropping the install fee.
  total: number | null;
  missingAdjustedPriceTypeIds: number[]; // base materials with no adjusted price
  missingSystemCostIndex: boolean;
}

// Job installation fee from the blueprint's ME0 base materials and the system's
// activity cost index. `baseMaterials` is the job's direct ME0 base list,
// UN-run-scaled — same shape as computeBuildCost's input but a different
// semantic basis (and priced with CCP adjusted prices, not market buy/sell).
export function computeJobInstallationFee(
  baseMaterials: MaterialQty[],
  adjustedPriceOf: AdjustedPriceOf,
  systemCostIndex: number | null,
  rates: FeeRates = DEFAULT_FEE_RATES,
): JobInstallationFee {
  const missingAdjustedPriceTypeIds: number[] = [];
  let estimatedItemValue = 0;

  for (const m of baseMaterials) {
    const adjusted = adjustedPriceOf(m.typeId);
    if (adjusted === null) {
      missingAdjustedPriceTypeIds.push(m.typeId);
      continue;
    }
    estimatedItemValue += adjusted * m.quantity;
  }

  const facilityTax = estimatedItemValue * rates.facilityTax;
  const sccSurcharge = estimatedItemValue * rates.sccSurcharge;
  const missingSystemCostIndex = systemCostIndex === null;
  const jobGrossCost = missingSystemCostIndex ? null : estimatedItemValue * systemCostIndex;
  const total = jobGrossCost === null ? null : jobGrossCost + facilityTax + sccSurcharge;

  return {
    estimatedItemValue,
    jobGrossCost,
    facilityTax,
    sccSurcharge,
    total,
    missingAdjustedPriceTypeIds,
    missingSystemCostIndex,
  };
}

export interface SellSideFees {
  salesTax: number | null; // revenue × salesTax
  brokerFee: number | null; // revenue × brokerFee
  total: number | null;
}

// Sell-side trading fees on the product's sell revenue. Null (not zero) when
// revenue is unknown, so a caller can't sum it into a total and undercount.
export function computeSellSideFees(
  revenue: number | null,
  rates: FeeRates = DEFAULT_FEE_RATES,
): SellSideFees {
  if (revenue === null) {
    return { salesTax: null, brokerFee: null, total: null };
  }
  const salesTax = revenue * rates.salesTax;
  const brokerFee = revenue * rates.brokerFee;
  return { salesTax, brokerFee, total: salesTax + brokerFee };
}

export interface NetMarginInput extends MarginInput {
  // ME0 base materials of the job, for EIV (distinct from the build-cost list).
  baseMaterials: MaterialQty[];
  adjustedPriceOf: AdjustedPriceOf;
  systemCostIndex: number | null;
  rates?: FeeRates;
}

export interface NetMargin {
  revenue: number | null;
  buildCost: number;
  grossMargin: number | null; // revenue − buildCost (from computeMargin, reused)
  jobFee: JobInstallationFee;
  sellSide: SellSideFees;
  netCost: number | null; // buildCost + jobFee.total; null when jobFee.total null
  netMargin: number | null; // revenue − sellSide.total − netCost; null if any null
  netMarginPct: number | null; // netMargin / revenue × 100; null when revenue null or ≤ 0
  incomplete: boolean; // missing index OR missing adjusted price OR revenue null
}

// Net margin = gross margin − job installation fee − sell-side fees. Composes
// computeMargin for the gross numbers (one definition of gross margin, so the
// gross path matches profitability.ts exactly), then the two fee functions.
// grossMargin is never collapsed by a null jobFee — the UI can degrade to "gross
// known, net unknown".
export function computeNetMargin(input: NetMarginInput): NetMargin {
  const rates = input.rates ?? DEFAULT_FEE_RATES;
  const gross = computeMargin(input);
  const jobFee = computeJobInstallationFee(
    input.baseMaterials,
    input.adjustedPriceOf,
    input.systemCostIndex,
    rates,
  );
  const sellSide = computeSellSideFees(gross.revenue, rates);

  const netCost = jobFee.total === null ? null : input.buildCost + jobFee.total;
  const netMargin =
    gross.revenue === null || sellSide.total === null || netCost === null
      ? null
      : gross.revenue - sellSide.total - netCost;
  const netMarginPct =
    netMargin !== null && gross.revenue !== null && gross.revenue > 0
      ? (netMargin / gross.revenue) * 100
      : null;

  const incomplete =
    jobFee.missingSystemCostIndex ||
    jobFee.missingAdjustedPriceTypeIds.length > 0 ||
    gross.revenue === null;

  return {
    revenue: gross.revenue,
    buildCost: input.buildCost,
    grossMargin: gross.margin,
    jobFee,
    sellSide,
    netCost,
    netMargin,
    netMarginPct,
    incomplete,
  };
}
