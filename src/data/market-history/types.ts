export interface HistoryDailyRow {

  date: string;

  average: number;
  highest: number;
  lowest: number;

  volume: bigint;

  orderCount: number;
}

export type HistorySource = 'esi';

export interface RawHistory {
  typeId: number;
  rows: HistoryDailyRow[];

  staleAfter: Date;
  source: HistorySource;
}

export interface AdvWindow {
  days: number;

  adv: number | null;
}

export interface MarketHistoryInputs {
  typeId: number;

  averageDailyVolume: AdvWindow[];

  volumeCv: number | null;

  priceVolatility: number | null;

  daysCovered: number;

  latestDate: string | null;
}
