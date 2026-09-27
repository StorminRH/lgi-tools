export function eligibleIdsKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}

export function anyEligibleCold(
  characters: Array<{ characterId: number; data: unknown }>,
  eligibleKey: string,
): boolean {
  const eligible = new Set(eligibleKey === '' ? [] : eligibleKey.split(',').map(Number));
  return characters.some((character) => character.data === null && eligible.has(character.characterId));
}

/** One reconcile fetch 4s after a cold load: enough for a single on-view refresh. */
export const RECONCILE_ONCE: readonly number[] = [4_000];

/**
 * How long to wait before the next reconcile fetch, or null to stop: while
 * the data is still cold, each attempt takes the next step of the schedule.
 */
export function reconcileDelay<TResponse, TKey>(
  attempt: number,
  response: TResponse,
  key: TKey,
  isCold: (response: TResponse, key: TKey) => boolean,
  schedule: readonly number[],
): number | null {
  const delay = schedule[attempt];
  return delay === undefined || !isCold(response, key) ? null : delay;
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
