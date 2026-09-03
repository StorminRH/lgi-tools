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

export function shouldReconcile<TResponse, TKey>(
  reconciled: boolean,
  response: TResponse,
  key: TKey,
  isCold: (response: TResponse, key: TKey) => boolean,
): boolean {
  return !reconciled && isCold(response, key);
}
