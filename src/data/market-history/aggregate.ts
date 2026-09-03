import {
  HISTORY_ADV_WINDOWS,
  HISTORY_STABILITY_WINDOW_DAYS,
} from './constants';
import type { HistoryDailyRow, MarketHistoryInputs } from './types';

function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function rowsInWindow(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): HistoryDailyRow[] {
  const end = toDayNumber(asOf);
  const start = end - windowDays + 1;
  return rows.filter((r) => {
    const d = toDayNumber(r.date);
    return d >= start && d <= end;
  });
}

function windowVolumeTotal(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): { inWindow: HistoryDailyRow[]; total: number } | null {
  const inWindow = rowsInWindow(rows, windowDays, asOf);
  if (inWindow.length === 0) return null;
  let total = 0;
  for (const r of inWindow) total += Number(r.volume);
  return { inWindow, total };
}

export function averageDailyVolume(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const w = windowVolumeTotal(rows, windowDays, asOf);
  if (w === null) return null;
  return w.total / windowDays;
}

export function volumeCoefficientOfVariation(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const w = windowVolumeTotal(rows, windowDays, asOf);
  if (w === null) return null;
  const { inWindow, total } = w;
  const mean = total / windowDays;
  if (mean === 0) return null;
  let sumSq = 0;
  for (const r of inWindow) {
    const d = Number(r.volume) - mean;
    sumSq += d * d;
  }
  const absent = windowDays - inWindow.length;
  sumSq += absent * mean * mean;
  const stddev = Math.sqrt(sumSq / windowDays);
  return stddev / mean;
}

export function priceVolatility(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const inWindow = rowsInWindow(rows, windowDays, asOf);
  if (inWindow.length < 2) return null;
  let total = 0;
  for (const r of inWindow) total += r.average;
  const mean = total / inWindow.length;
  if (mean === 0) return null;
  let sumSq = 0;
  for (const r of inWindow) {
    const d = r.average - mean;
    sumSq += d * d;
  }
  const stddev = Math.sqrt(sumSq / inWindow.length);
  return stddev / mean;
}

export function coverage(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number {
  return rowsInWindow(rows, windowDays, asOf).length;
}

export function computeHistoryInputs(
  typeId: number,
  rows: HistoryDailyRow[],
): MarketHistoryInputs {
  const [first] = rows;
  if (first === undefined) {
    return {
      typeId,
      averageDailyVolume: HISTORY_ADV_WINDOWS.map((days) => ({ days, adv: null })),
      volumeCv: null,
      priceVolatility: null,
      daysCovered: 0,
      latestDate: null,
    };
  }
  let latestDate = first.date;
  for (const r of rows) if (r.date > latestDate) latestDate = r.date;

  return {
    typeId,
    averageDailyVolume: HISTORY_ADV_WINDOWS.map((days) => ({
      days,
      adv: averageDailyVolume(rows, days, latestDate),
    })),
    volumeCv: volumeCoefficientOfVariation(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    priceVolatility: priceVolatility(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    daysCovered: coverage(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    latestDate,
  };
}
