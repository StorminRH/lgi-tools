import { computeMargin, type MarginInput, type MaterialQty } from './profitability';

export interface FeeRates {
  facilityTax: number;
  sccSurcharge: number;
  salesTax: number;
  brokerFee: number;
}

export const DEFAULT_FEE_RATES: FeeRates = {
  facilityTax: 0.0025,
  sccSurcharge: 0.04,
  salesTax: 0.075,
  brokerFee: 0.03,
};

export const REACTION_SCC_SURCHARGE = 0.04;

export const MAX_FACILITY_TAX_PCT = 10;

export function effectiveFacilityTaxRate(enteredPct: number | null): number {
  return enteredPct === null ? DEFAULT_FEE_RATES.facilityTax : enteredPct / 100;
}

export function parseFacilityTaxDraft(
  draft: string,
): { ok: true; value: number | null } | { ok: false } {
  const t = draft.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FACILITY_TAX_PCT) return { ok: false };
  return { ok: true, value: n };
}

export function taxDraftFromStored(taxPct: number | null): string {
  return taxPct === null ? '' : String(taxPct);
}

/**
 * CCP "adjusted price" for a type, or null when there's no usable adjusted price
 * (no row, or a stored NULL — the absent-vs-0.0 distinction the adjusted_prices
 * table preserves). Mirrors PriceOf, but a single number per type. A returned 0
 * is a real, known price, NOT "missing".
 */
export type AdjustedPriceOf = (typeId: number) => number | null;

export interface JobInstallationFee {

  estimatedItemValue: number;

  jobGrossCost: number | null;
  facilityTax: number;
  sccSurcharge: number;

  total: number | null;
  missingAdjustedPriceTypeIds: number[];
  missingSystemCostIndex: boolean;
}

export function computeJobInstallationFee(
  baseMaterials: MaterialQty[],
  adjustedPriceOf: AdjustedPriceOf,
  systemCostIndex: number | null,
  rates: FeeRates = DEFAULT_FEE_RATES,

  structureCostBonusPct = 0,
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
  const jobGrossCost = missingSystemCostIndex
    ? null
    : estimatedItemValue * systemCostIndex * (1 - structureCostBonusPct / 100);
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
  salesTax: number | null;
  brokerFee: number | null;
  total: number | null;
}

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

  baseMaterials: MaterialQty[];
  adjustedPriceOf: AdjustedPriceOf;
  systemCostIndex: number | null;
  rates?: FeeRates;

  structureCostBonusPct?: number;
}

export interface NetMargin {
  revenue: number | null;
  buildCost: number;
  grossMargin: number | null;
  jobFee: JobInstallationFee;
  sellSide: SellSideFees;
  netCost: number | null;
  netMargin: number | null;
  netMarginPct: number | null;
  incomplete: boolean;
}

export function computeNetMargin(input: NetMarginInput): NetMargin {
  const rates = input.rates ?? DEFAULT_FEE_RATES;
  const gross = computeMargin(input);
  const jobFee = computeJobInstallationFee(
    input.baseMaterials,
    input.adjustedPriceOf,
    input.systemCostIndex,
    rates,
    input.structureCostBonusPct ?? 0,
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
