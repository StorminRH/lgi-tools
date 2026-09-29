/**
 * Research math over a region's daily market history: trend, volatility,
 * where today's price sits, how a price might move while a batch is built and
 * sold, and what that does to the margin. Every figure is derived from the
 * daily rows ESI publishes (volume-weighted average, high, low, volume, order
 * count), so each can be explained from the chart it sits beside.
 */

export interface MarketDay {
  /** YYYY-MM-DD, UTC. */
  date: string;
  average: number;
  highest: number;
  lowest: number;
  volume: number;
  orderCount: number;
}

export interface FilledDay extends MarketDay {
  /** False for a calendar day with no trades: its price carries from the last traded day. */
  traded: boolean;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function quietDay(day: number, carry: MarketDay): FilledDay {
  return {
    date: dateOf(day),
    average: carry.average,
    highest: carry.average,
    lowest: carry.average,
    volume: 0,
    orderCount: 0,
    traded: false,
  };
}

/**
 * The last `days` calendar days ending on the latest row. A day with no trades
 * keeps the previous price at zero volume; days before the first trade in the
 * window are left out.
 */
export function fillDays(rows: readonly MarketDay[], days: number): FilledDay[] {
  if (rows.length === 0 || days <= 0) return [];
  const byDay = new Map<number, MarketDay>();
  for (const row of rows) byDay.set(dayNumber(row.date), row);
  const end = Math.max(...byDay.keys());
  const start = end - days + 1;
  let carry: MarketDay | undefined;
  for (const [day, row] of byDay) {
    if (day < start && (carry === undefined || day > dayNumber(carry.date))) carry = row;
  }
  const out: FilledDay[] = [];
  for (let day = start; day <= end; day++) {
    const row = byDay.get(day);
    if (row !== undefined) {
      out.push({ ...row, traded: true });
      carry = row;
    } else if (carry !== undefined) {
      out.push(quietDay(day, carry));
    }
  }
  return out;
}

/** Trailing simple average; null until the window has filled. */
export function movingAverage(values: readonly number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Sample standard deviation; null below two values. */
export function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  let sumSq = 0;
  for (const v of values) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / (values.length - 1));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const MAD_TO_SIGMA = 1.4826;

/** A standard deviation read from the median absolute deviation, so one wild day can't swing it. */
export function robustSigma(values: readonly number[]): number {
  const m = median(values);
  return MAD_TO_SIGMA * median(values.map((v) => Math.abs(v - m)));
}

/**
 * Day-over-day log changes in the average price across traded days, each
 * scaled to one day when quiet days sit between them.
 */
export function logReturns(days: readonly FilledDay[]): number[] {
  const out: number[] = [];
  let previous: { price: number; index: number } | undefined;
  days.forEach((day, index) => {
    if (!day.traded || day.average <= 0) return;
    if (previous !== undefined) out.push(Math.log(day.average / previous.price) / Math.sqrt(index - previous.index));
    previous = { price: day.average, index };
  });
  return out;
}

/**
 * Typical one-day price move as a fraction (0.02 is 2%); null without enough
 * trades. Robust to a single outlier day; a market that barely moves except
 * for rare jumps falls back to the plain deviation.
 */
export function dailyVolatility(days: readonly FilledDay[]): number | null {
  const returns = logReturns(days);
  if (returns.length < 5) return null;
  const robust = robustSigma(returns);
  return robust > 0 ? robust : (stdDev(returns) ?? 0);
}

export interface PriceTrend {
  /** Fitted change in log price per day. */
  slopePerDay: number;
  /** The fitted line's move over 30 days, as a fraction. */
  pctPer30d: number;
  /** How well the line fits, 0 to 1: a noisy market's trend means little. */
  r2: number;
}

/** Least-squares line through log price on traded days; null below 5 traded days. */
export function priceTrend(days: readonly FilledDay[]): PriceTrend | null {
  const points = days.flatMap((day, i) => (day.traded && day.average > 0 ? [{ x: i, y: Math.log(day.average) }] : []));
  if (points.length < 5) return null;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
    syy += (p.y - my) * (p.y - my);
  }
  const slopePerDay = sxx === 0 ? 0 : sxy / sxx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slopePerDay, pctPer30d: Math.exp(slopePerDay * 30) - 1, r2 };
}

/** Only a trend that fits is carried forward, at half strength, and never past 1% a day. */
const DRIFT_DAMPING = 0.5;
export const DRIFT_CAP_PER_DAY = 0.01;

export function projectedDrift(trend: PriceTrend | null): number {
  if (trend === null) return 0;
  const drift = trend.slopePerDay * trend.r2 * DRIFT_DAMPING;
  return Math.max(-DRIFT_CAP_PER_DAY, Math.min(DRIFT_CAP_PER_DAY, drift));
}

export type PricePosition = 'rich' | 'fair' | 'cheap';

export interface PriceStanding {
  /** Standard deviations from the window's mean log price. */
  z: number;
  mean: number;
  position: PricePosition;
}

const POSITION_Z = 1.5;

/** Where a price sits against the window's traded prices, on a log scale. */
export function priceStanding(price: number, days: readonly FilledDay[]): PriceStanding | null {
  const logs = days.filter((day) => day.traded && day.average > 0).map((day) => Math.log(day.average));
  const sd = stdDev(logs);
  if (sd === null || price <= 0) return null;
  const m = mean(logs);
  const z = sd === 0 ? 0 : (Math.log(price) - m) / sd;
  const position: PricePosition = z > POSITION_Z ? 'rich' : z < -POSITION_Z ? 'cheap' : 'fair';
  return { z, mean: Math.exp(m), position };
}

/** Exponential average with the usual 2 / (n + 1) weight, seeded on the first value. */
export function ema(values: readonly number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  values.forEach((value, i) => out.push(i === 0 ? value : value * k + (out[i - 1] ?? value) * (1 - k)));
  return out;
}

export type Momentum = 'rising' | 'falling' | 'flat';

export interface MomentumRead {
  /** EMA7 over EMA30, less one: 0.03 means the week runs 3% above the month. */
  ratio: number;
  direction: Momentum;
}

const MOMENTUM_BAND = 0.02;

/** The week's price against the month's, read on the last day. */
export function momentum(days: readonly FilledDay[]): MomentumRead | null {
  if (days.length < 14) return null;
  const prices = days.map((day) => day.average);
  const fast = ema(prices, 7).at(-1);
  const slow = ema(prices, 30).at(-1);
  if (fast === undefined || slow === undefined || slow <= 0) return null;
  const ratio = fast / slow - 1;
  const direction: Momentum = ratio > MOMENTUM_BAND ? 'rising' : ratio < -MOMENTUM_BAND ? 'falling' : 'flat';
  return { ratio, direction };
}

/** How far the last price sits below the window's peak, as a fraction. */
export function drawdown(days: readonly FilledDay[]): number | null {
  const last = days.at(-1);
  if (last === undefined) return null;
  const peak = Math.max(...days.map((day) => day.average));
  return peak > 0 ? 1 - last.average / peak : null;
}

export interface ClippedDay extends FilledDay {
  /** The day's high and low with fat-finger fills pulled back to a typical range. */
  high: number;
  low: number;
  /** Where the average sits between low and high: near 1, trades filled sell orders. */
  sellShare: number | null;
}

function clipCap(excursions: readonly number[]): number {
  if (excursions.length === 0) return Infinity;
  return median(excursions) + 3 * robustSigma(excursions);
}

/**
 * Daily highs and lows are raw extremes, so a single mistyped order sets
 * them. Each is capped at the window's typical excursion from the average
 * plus three robust deviations.
 */
export function clipRanges(days: readonly FilledDay[]): { days: ClippedDay[]; clippedShare: number } {
  const traded = days.filter((day) => day.traded && day.average > 0);
  const upCap = clipCap(traded.map((day) => day.highest / day.average - 1));
  const downCap = clipCap(traded.map((day) => 1 - day.lowest / day.average));
  let clipped = 0;
  const out = days.map((day): ClippedDay => {
    const high = Math.min(day.highest, day.average * (1 + upCap));
    const low = Math.max(day.lowest, day.average * (1 - downCap));
    if (day.traded && (high < day.highest || low > day.lowest)) clipped++;
    const span = high - low;
    const sellShare = day.traded && span > 0 ? Math.min(1, Math.max(0, (day.average - low) / span)) : null;
    return { ...day, high, low, sellShare };
  });
  return { days: out, clippedShare: traded.length === 0 ? 0 : clipped / traded.length };
}

/** Volume-weighted share of trades that filled sell orders: buyers paying the ask. */
export function sellSideShare(days: readonly ClippedDay[]): number | null {
  let weighted = 0;
  let volume = 0;
  for (const day of days) {
    if (day.sellShare === null) continue;
    weighted += day.sellShare * day.volume;
    volume += day.volume;
  }
  return volume > 0 ? weighted / volume : null;
}

export const UNDERCUT_MIN = 0.002;
export const UNDERCUT_MAX = 0.05;

export interface ListPrice {
  /** The price a new listing can expect to fill at. */
  price: number;
  /** The allowance taken off for undercutting, as a fraction. */
  undercut: number;
}

/**
 * What a new sell order can expect: never above today's ask, pulled halfway
 * toward the week's typical sell-side fill, less half the typical daily range
 * for being undercut.
 */
export function expectedListPrice(bestSell: number, days: readonly ClippedDay[]): ListPrice {
  const recent = days.slice(-7).filter((day) => day.traded);
  const recentHigh = recent.length > 0 ? median(recent.map((day) => day.high)) : bestSell;
  const anchor = Math.min(bestSell, (bestSell + recentHigh) / 2);
  const ranges = days.slice(-30).filter((day) => day.traded && day.average > 0).map((day) => (day.high - day.low) / day.average);
  const halfRange = ranges.length > 0 ? median(ranges) / 2 : UNDERCUT_MIN;
  const undercut = Math.min(UNDERCUT_MAX, Math.max(UNDERCUT_MIN, halfRange));
  return { price: anchor * (1 - undercut), undercut };
}

// Abramowitz & Stegun 7.1.26; absolute error below 1.5e-7.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

const Z_P90 = 1.2815515655446004;

export interface PriceProjection {
  horizonDays: number;
  /** Mean and spread of the log price at the horizon. */
  logMean: number;
  logSd: number;
  p10: number;
  p50: number;
  p90: number;
  /** Chance the price ends above a level. */
  probAbove: (level: number) => number;
}

/**
 * A lognormal spread of where the price may be after `horizonDays`: the
 * typical daily move scales with the square root of time, and the damped
 * trend shifts the centre.
 */
export function projectPrice(
  spot: number,
  dailyVol: number,
  driftPerDay: number,
  horizonDays: number,
): PriceProjection {
  const h = Math.max(0, horizonDays);
  const s = dailyVol * Math.sqrt(h);
  const mu = Math.log(spot) + driftPerDay * h - (s * s) / 2;
  const probAbove = (level: number) => {
    if (level <= 0) return 1;
    if (s === 0) return mu > Math.log(level) ? 1 : 0;
    return 1 - normalCdf((Math.log(level) - mu) / s);
  };
  return {
    horizonDays: h,
    logMean: mu,
    logSd: s,
    p10: Math.exp(mu - Z_P90 * s),
    p50: Math.exp(mu),
    p90: Math.exp(mu + Z_P90 * s),
    probAbove,
  };
}

export interface ProfitOutlookInputs {
  /** Inputs plus job fee for one unit of product. */
  unitCost: number;
  /** The price the batch is listed at: today's best sell. */
  spot: number;
  /** Sales tax plus broker fee, as a fraction of the sale. */
  sellFeeRate: number;
  dailyVol: number;
  driftPerDay: number;
  /** Build time plus the time to sell the batch. */
  horizonDays: number;
}

export interface Band {
  p10: number;
  p50: number;
  p90: number;
}

export interface ProfitOutlook {
  /** The lowest sell price that still covers cost and fees. */
  breakeven: number;
  /** How far the price can fall from today before the build loses money, as a fraction. */
  cushion: number;
  projection: PriceProjection;
  netPerUnit: Band;
  marginPct: Band;
  probProfit: number;
}

export function profitOutlook(inputs: ProfitOutlookInputs): ProfitOutlook {
  const keep = 1 - inputs.sellFeeRate;
  const breakeven = inputs.unitCost / keep;
  const projection = projectPrice(inputs.spot, inputs.dailyVol, inputs.driftPerDay, inputs.horizonDays);
  const net = (price: number) => price * keep - inputs.unitCost;
  const pct = (price: number) => (price > 0 ? (net(price) / price) * 100 : 0);
  return {
    breakeven,
    cushion: inputs.spot > 0 ? (inputs.spot - breakeven) / inputs.spot : 0,
    projection,
    netPerUnit: { p10: net(projection.p10), p50: net(projection.p50), p90: net(projection.p90) },
    marginPct: { p10: pct(projection.p10), p50: pct(projection.p50), p90: pct(projection.p90) },
    probProfit: projection.probAbove(breakeven),
  };
}

/** Days to sell `units` when the batch takes `share` of the day's traded volume. */
export function sellThroughDays(units: number, adv: number | null, share: number): number | null {
  if (adv === null || adv <= 0 || share <= 0) return null;
  return units / (adv * share);
}

export interface FlowStats {
  /** Units traded per calendar day. */
  adv: number;
  /** ISK traded per calendar day. */
  iskPerDay: number;
  /** Units per recorded order: how much one buyer takes. */
  unitsPerOrder: number | null;
  tradedDays: number;
  days: number;
}

export function flowStats(days: readonly FilledDay[]): FlowStats | null {
  if (days.length === 0) return null;
  let volume = 0;
  let isk = 0;
  let orders = 0;
  let tradedDays = 0;
  for (const day of days) {
    volume += day.volume;
    isk += day.volume * day.average;
    orders += day.orderCount;
    if (day.traded && day.volume > 0) tradedDays++;
  }
  return {
    adv: volume / days.length,
    iskPerDay: isk / days.length,
    unitsPerOrder: orders > 0 ? volume / orders : null,
    tradedDays,
    days: days.length,
  };
}

/**
 * Each weekday's volume against the average day, Monday first: 1.2 means that
 * day trades 20% above a typical day. Null without two full weeks.
 */
export function weekdayVolumeIndex(days: readonly FilledDay[]): number[] | null {
  if (days.length < 14) return null;
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    const weekday = (new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    totals[weekday] = (totals[weekday] ?? 0) + day.volume;
    counts[weekday] = (counts[weekday] ?? 0) + 1;
  }
  const perDay = totals.map((total, i) => total / Math.max(1, counts[i] ?? 0));
  const overall = mean(perDay);
  if (overall === 0) return null;
  return perDay.map((value) => value / overall);
}
