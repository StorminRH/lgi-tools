// Pure helpers for the client live-tracker platform (Family-1 generalization). The
// per-character trackers (jobs, skills) share the reload key + the cold-owner reconcile
// signal; the shell (src/components/use-live-dataset.ts) shares the reconcile decision.
// Factored here so the thin per-slice hooks stay trivial and this branching logic is
// unit-tested (the hook effects themselves are integration/visual-tested).

// The stable reload key for a character-owner tracker: the eligible ids deduped + sorted
// into one string, so a new-array-same-ids render doesn't re-run the load effect. A
// needs-reconnect character never syncs, so callers pass only ELIGIBLE ids — otherwise
// the cold reconcile would fire forever.
export function eligibleIdsKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}

// Whether any scope-eligible character is still cold (data:null) — the signal that the
// on-view write-behind hasn't populated Neon yet, so one reconcile re-fetch is due. Takes
// the same deduped id key the reload uses (parsed back to a set) so the two agree. Both
// character-owner responses (jobs, skills) satisfy the structural row shape.
export function anyEligibleCold(
  characters: Array<{ characterId: number; data: unknown }>,
  eligibleKey: string,
): boolean {
  const eligible = new Set(eligibleKey === '' ? [] : eligibleKey.split(',').map(Number));
  return characters.some((character) => character.data === null && eligible.has(character.characterId));
}

// The one-shot reconcile decision the shell's load effect branches on: reconcile once,
// only while it hasn't already, and only when the dataset reports itself cold. Extracted
// so the load closure stays trivial (cyclomatic ≤ 4 → passes CRAP untested) and this
// decision is tested directly.
export function shouldReconcile<TResponse, TKey>(
  reconciled: boolean,
  response: TResponse,
  key: TKey,
  isCold: (response: TResponse, key: TKey) => boolean,
): boolean {
  return !reconciled && isCold(response, key);
}
