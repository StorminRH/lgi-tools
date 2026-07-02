// Request-scoped bridge between the absorb-on-proof orchestrator (which runs
// deep inside Better Auth's OAuth callback, with no access to the response)
// and the auth route's GET wrapper (which decorates the success redirect with
// the moved character). AsyncLocalStorage, not module state: concurrent
// callbacks must never see each other's outcome.
import { AsyncLocalStorage } from 'node:async_hooks';

type AbsorbBox = { absorbedCharacterId: number | null };

const absorbStore = new AsyncLocalStorage<AbsorbBox>();

// Run `fn` (the Better Auth handler call) with an absorb outcome box in scope,
// and report what — if anything — was absorbed during it.
export async function runWithAbsorbTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; absorbedCharacterId: number | null }> {
  const box: AbsorbBox = { absorbedCharacterId: null };
  const result = await absorbStore.run(box, fn);
  return { result, absorbedCharacterId: box.absorbedCharacterId };
}

// Record an absorb from inside the callback. No-op when no box is active
// (POST paths, tests that drive the orchestrator directly).
export function recordAbsorb(characterId: number): void {
  const box = absorbStore.getStore();
  if (box) box.absorbedCharacterId = characterId;
}
