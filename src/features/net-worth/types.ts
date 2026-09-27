export interface PilotWorth {
  netWorth: number;
  liquidIsk: number;
}

export interface NetWorthDay {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  netWorth: number;
  liquidIsk: number;
  pilotsIncluded: number;
  pilotsTotal: number;
  pilots: Record<string, PilotWorth>;
}
