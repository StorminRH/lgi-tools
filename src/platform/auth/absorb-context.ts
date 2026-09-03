import { AsyncLocalStorage } from 'node:async_hooks';

type AbsorbBox = { absorbedCharacterId: number | null };

const absorbStore = new AsyncLocalStorage<AbsorbBox>();

export async function runWithAbsorbTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; absorbedCharacterId: number | null }> {
  const box: AbsorbBox = { absorbedCharacterId: null };
  const result = await absorbStore.run(box, fn);
  return { result, absorbedCharacterId: box.absorbedCharacterId };
}

export function recordAbsorb(characterId: number): void {
  const box = absorbStore.getStore();
  if (box) box.absorbedCharacterId = characterId;
}
