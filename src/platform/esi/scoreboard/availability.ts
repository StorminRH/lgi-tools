import { AVAILABILITY_WINDOW_MINUTES, NO_RESPONSE_STATUS } from './types';

/** A call that counts against availability: no answer, held back by ESI, or a server error. */
export function isFailedCall(status: number): boolean {
  return status === NO_RESPONSE_STATUS || status === 420 || status === 429 || status >= 500;
}

/** The minute buckets inside the availability window, ending at the given minute. */
export function windowMinutes(minute: number): number[] {
  return Array.from({ length: AVAILABILITY_WINDOW_MINUTES }, (_, back) => minute - back);
}

export function sumCounts(counts: readonly (number | null)[]): number {
  return counts.reduce<number>((total, count) => total + (count ?? 0), 0);
}
