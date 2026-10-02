
const DAYS = 21;
const START = Date.UTC(2026, 8, 1);
const DAY_MS = 86_400_000;

function dayLabel(index: number): string {
  return new Date(START + index * DAY_MS).toISOString().slice(0, 10);
}

function wave(index: number, base: number, swing: number, period: number): number {
  return Math.round(base + swing * Math.sin((index / period) * Math.PI * 2) + (index % 3) * swing * 0.15);
}

const indices = Array.from({ length: DAYS }, (_, index) => index);

export const sampleLabels = indices.map(dayLabel);

export const sampleWeekend = indices.map((index) => {
  const weekday = new Date(START + index * DAY_MS).getUTCDay();
  return weekday === 0 || weekday === 6;
});

export const sampleDaily = indices.map((index) => ({ x: index, y: wave(index, 120, 40, 7) }));

export const sampleAverage = sampleDaily.map((_, index) => {
  const window = sampleDaily.slice(Math.max(0, index - 6), index + 1);
  return Math.round(window.reduce((sum, point) => sum + point.y, 0) / window.length);
});

export const sampleTrend = indices.map((index) => ({ x: index, y: wave(index, 60, 18, 10) + index * 2 }));

export const sampleStacked = indices.map((index) => ({
  x: index,
  label: dayLabel(index),
  values: [wave(index, 40, 10, 9), index < 6 ? null : wave(index, 22, 6, 5)],
}));

export const sampleSplit = indices.map((index) => ({
  x: index,
  label: dayLabel(index),
  upper: index % 9 === 4 ? null : wave(index, 9_400, 300, 8),
  lower: wave(index, 120, 30, 6),
}));

export const sampleBars = [
  { label: 'Gas', value: 42 },
  { label: 'Ore', value: 28 },
  { label: 'Relic', value: 17 },
  { label: 'Data', value: 11 },
  { label: 'Combat', value: 6 },
];
