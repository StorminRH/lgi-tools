// Feature-level domain → UI mapping for the Industry Planner. The only place
// that knows "a thin margin is orange" or "activity 1 is Manufacturing". The
// reusable primitives stay domain-agnostic; this file picks tones/labels from
// the shared vocabulary (CLAUDE.md > Architecture Invariants).

import type { ConfidenceLevel } from '@/components/ui/price-confidence';
import { toneTextClass, type Tone } from '@/components/ui/tones';
import type { PriceSource } from '@/data/market-prices/types';

// Below this percentage a positive margin is "thin" (orange) rather than
// healthy (green). A rough cut for at-a-glance scanning, not a trading signal.
const THIN_MARGIN_PCT = 5;

// Text-colour class for a margin figure. Loss → red, thin → orange, healthy →
// green, unknown (no product sell price) → muted.
export function marginToneClass(marginPct: number | null): string {
  if (marginPct === null) return 'text-muted';
  if (marginPct < 0) return toneTextClass('red');
  if (marginPct < THIN_MARGIN_PCT) return toneTextClass('orange');
  return toneTextClass('green');
}

// Industry activity labels. Manufacturing (1) and reactions (11) are the only
// activities the planner models (see eve-data INDUSTRY_ACTIVITY_IDS).
export const ACTIVITY_LABEL: Record<number, string> = {
  1: 'Manufacturing',
  11: 'Reaction',
};

export function activityLabel(activityId: number): string {
  return ACTIVITY_LABEL[activityId] ?? 'Industry';
}

// A material/build category: a display label, a palette tone, and a sort order.
// Categories are keyed off the SDE *group* (not the broader category), because
// group is what distinguishes e.g. a manufactured Fuel Block from a reaction
// output — both sit under the `Material` SDE category. Adding/retuning a
// category is a config edit here; nothing else changes.
export interface Category {
  label: string;
  tone: Tone;
  order: number;
}

// --- Raw materials (the cost panel — things you buy/gather) ------------
const MINERALS: Category = { label: 'Minerals', tone: 'neutral', order: 21 };
const ICE: Category = { label: 'Ice Products', tone: 'blue', order: 22 };
const GAS: Category = { label: 'Gas', tone: 'teal', order: 23 };
const MOON: Category = { label: 'Moon Materials', tone: 'magenta', order: 24 };
const SALVAGE: Category = { label: 'Salvage', tone: 'yellow', order: 25 };
const PLANETARY: Category = { label: 'Planetary', tone: 'orange-soft', order: 26 };
const OTHER_MATERIAL: Category = { label: 'Other Materials', tone: 'neutral', order: 29 };

const RAW_BY_GROUP: Record<string, Category> = {
  Mineral: MINERALS,
  'Ice Product': ICE,
  'Harvestable Cloud': GAS,
  'Moon Materials': MOON,
  'Ancient Salvage': SALVAGE,
  'Salvaged Materials': SALVAGE,
  'Named Components': SALVAGE,
  'Rogue Drone Components': SALVAGE,
  'Abyssal Materials': SALVAGE,
};

export function classifyRaw(groupName: string, categoryName: string): Category {
  return (
    RAW_BY_GROUP[groupName] ??
    (categoryName === 'Planetary Commodities' ? PLANETARY : OTHER_MATERIAL)
  );
}

// --- Build-sequence tree: a node's label + colour ----------------------
// The phase a node sits in (how deep it is) is derived from graph height in
// the data layer; this picks only its LABEL and colour, and every label is a
// real in-game identifier — never an invented bucket. A reaction output
// (activity 11) reads as "Reaction"; any other buildable reads as its own SDE
// group name. The root product reads as its group/category (e.g. "Frigate").
// Raws reuse the ledger's source-category colour but show their real SDE group
// name, so no invented name enters the tree.
const REACTION_ACTIVITY_ID = 11;

export interface NodeLabel {
  label: string;
  tone: Tone;
}

export function classifyBuildNode(args: {
  isRaw: boolean;
  isRoot: boolean;
  activityId?: number;
  groupName: string;
  categoryName: string;
}): NodeLabel {
  const { isRaw, isRoot, activityId, groupName, categoryName } = args;
  if (isRaw) {
    return { label: groupName || categoryName || 'Raw Material', tone: classifyRaw(groupName, categoryName).tone };
  }
  if (isRoot) {
    return { label: groupName || categoryName || 'Final Product', tone: 'teal' };
  }
  if (activityId === REACTION_ACTIVITY_ID) {
    return { label: 'Reaction', tone: 'purple' };
  }
  return { label: groupName || categoryName || 'Manufacturing', tone: 'blue' };
}

// --- Price confidence: data quality → an abstract level + reasons ------
// The only place that maps a material's price signals (source / freshness /
// liquidity) onto the abstract `level` the `PriceConfidence` primitive renders.
// The primitive stays domain-agnostic; this is the domain mapping.
//
// Buy-side depth (units) below this reads as illiquid — a rough at-a-glance
// cut, not a trading signal (mirrors THIN_MARGIN_PCT). Exported so the browse
// catalog's SQL confidence aggregate uses the same threshold (one source).
export const THIN_LIQUIDITY_UNITS = 100;
// Aggregate headline bands: share of fully-trustworthy (high) material rows.
const HIGH_CONFIDENCE_SHARE = 0.75;
const MEDIUM_CONFIDENCE_SHARE = 0.4;

// The price signals a confidence verdict reads — a subset of MaterialCostRow.
export interface ConfidenceInput {
  source: PriceSource | null;
  buyVolume: number | null;
  unitBuy: number | null; // null = no usable buy price (excluded from cost)
  staleAfterMs: number | null; // null = no price row at all
}

export interface RowConfidence {
  level: ConfidenceLevel;
  reasons: string[];
}

export interface AggregateConfidence {
  level: ConfidenceLevel;
  summary: string;
}

const CONFIDENCE_HEADLINE: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unknown: 'Unknown confidence',
};

export function confidenceHeadline(level: ConfidenceLevel): string {
  return CONFIDENCE_HEADLINE[level];
}

// One material's price-confidence verdict at time `nowMs`. high = fresh ESI
// price with real depth; low = priced row but no usable price; unknown = no
// price row yet; medium = any single shortfall (stale / fallback source /
// thin depth). `nowMs` is passed in, never read from the wall clock, so this
// stays pure (and Cache-Components-safe — see CostPanel for who supplies it).
export function priceConfidence(input: ConfidenceInput, nowMs: number): RowConfidence {
  if (input.staleAfterMs === null) {
    return { level: 'unknown', reasons: ['No price data yet'] };
  }
  if (input.unitBuy === null) {
    return { level: 'low', reasons: ['No live price — excluded from cost'] };
  }
  const reasons: string[] = [];
  if (input.staleAfterMs <= nowMs) reasons.push('Stale — price may have moved');
  if (input.source !== null && input.source !== 'esi') reasons.push('Fallback price source');
  if (input.buyVolume !== null && input.buyVolume < THIN_LIQUIDITY_UNITS) {
    reasons.push('Thin market depth');
  }
  return reasons.length === 0 ? { level: 'high', reasons: [] } : { level: 'medium', reasons };
}

// The shortfall tallies behind an aggregate verdict. `total` is the row count
// the share is taken over; `high` is the fully-trustworthy rows; the rest count
// each shortfall independently (a row can be both stale and fallback).
export interface ConfidenceCounts {
  high: number;
  total: number;
  stale: number;
  fallback: number;
  thin: number;
  missing: number;
}

// Map shortfall counts onto one headline level + a breakdown string — the ONE
// place the share bands and summary format live. The browse catalog computes
// the counts in SQL (`aggregateConfidence` below tallies them in JS from the
// per-row verdicts); both funnel through here so neither can drift.
export function aggregateConfidenceFromCounts(c: ConfidenceCounts): AggregateConfidence {
  if (c.total === 0) return { level: 'unknown', summary: 'No materials to price' };

  const share = c.high / c.total;
  const level: ConfidenceLevel =
    share >= HIGH_CONFIDENCE_SHARE
      ? 'high'
      : share >= MEDIUM_CONFIDENCE_SHARE
        ? 'medium'
        : 'low';

  const parts: string[] = [];
  if (c.stale) parts.push(`${c.stale} stale`);
  if (c.fallback) parts.push(`${c.fallback} fallback`);
  if (c.thin) parts.push(`${c.thin} illiquid`);
  if (c.missing) parts.push(`${c.missing} missing`);
  return { level, summary: parts.length ? parts.join(' · ') : 'all live · liquid' };
}

// Roll the per-row verdicts into one headline level + a breakdown string for
// the cost panel's aggregate line ("High confidence — 1 stale · 1 missing").
// The headline is share-based (mostly-trustworthy rows still read "high", with
// the exceptions surfaced in the summary); the summary counts each shortfall.
export function aggregateConfidence(
  inputs: ConfidenceInput[],
  nowMs: number,
): AggregateConfidence {
  let high = 0;
  let stale = 0;
  let fallback = 0;
  let thin = 0;
  let missing = 0;
  for (const input of inputs) {
    const { level } = priceConfidence(input, nowMs);
    if (level === 'high') high += 1;
    if (level === 'low' || level === 'unknown') missing += 1;
    if (input.staleAfterMs !== null && input.unitBuy !== null) {
      if (input.staleAfterMs <= nowMs) stale += 1;
      if (input.source !== null && input.source !== 'esi') fallback += 1;
      if (input.buyVolume !== null && input.buyVolume < THIN_LIQUIDITY_UNITS) thin += 1;
    }
  }

  return aggregateConfidenceFromCounts({ high, total: inputs.length, stale, fallback, thin, missing });
}
