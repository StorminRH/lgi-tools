import { parseIdsKey } from './array';

export function anyEligibleCold(
  characters: Array<{ characterId: number; data: unknown }>,
  eligibleKey: string,
): boolean {
  const eligible = new Set(parseIdsKey(eligibleKey));
  return characters.some((character) => character.data === null && eligible.has(character.characterId));
}

/** What every EVE-data response says besides its rows: whether the view started an ESI refresh behind it. */
export interface LiveResponse {
  refreshing: boolean;
}

/**
 * The reconcile fetches after a load that found the data still cold. A first
 * sync reads about ten ESI endpoints per pilot and can outlast one check, so
 * the dataset keeps checking on a short backoff, then gives up.
 */
export const RECONCILE_SCHEDULE: readonly number[] = [4_000, 8_000, 15_000, 30_000, 60_000];

/** The coldness test of a dataset with no missing-data test of its own: cold only while a refresh is under way. */
export function neverCold(): boolean {
  return false;
}

/**
 * How long to wait before the next reconcile fetch, or null to stop: while a
 * refresh is still under way or the data is otherwise cold, each attempt
 * takes the next step of the schedule.
 */
export function reconcileDelay<TResponse extends LiveResponse, TKey>(
  attempt: number,
  response: TResponse,
  key: TKey,
  isCold: (response: TResponse, key: TKey) => boolean,
  schedule: readonly number[],
): number | null {
  const delay = schedule[attempt];
  return delay === undefined || !(response.refreshing || isCold(response, key)) ? null : delay;
}

/**
 * What a live dataset does when a fetch fails. Data already on screen stays
 * (`keep`); a first failure gets one delayed retry; a second one settles the
 * dataset as failed so the UI can stop showing a loading state.
 */
export function loadFailureStep(loaded: boolean, retried: boolean): 'keep' | 'retry' | 'fail' {
  if (loaded) return 'keep';
  return retried ? 'fail' : 'retry';
}
