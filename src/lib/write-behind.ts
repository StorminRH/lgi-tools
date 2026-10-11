import { bestEffort } from './best-effort';

/** What one write-behind pass, run after the response, persisted. */
export interface WriteBehindResult {
  outcome: 'succeeded' | 'partial' | 'failed';
  attempted: number;
  written: number;
  durationMs: number;
}

/**
 * Runs one write-behind pass of `attempted` writes and reports it. `persist`
 * returns how many writes succeeded and how many rows they wrote; the outcome
 * is 'succeeded' when every write did, 'failed' when none did, and 'partial'
 * otherwise. A `persist` that throws is logged as `[scope] write-behind failed`
 * and counts as nothing written. An observer that throws is logged as
 * `[scope] write-behind observer failed`. The promise never rejects, so it can
 * be handed to after() as it is.
 */
export async function runWriteBehind(
  scope: string,
  attempted: number,
  persist: () => Promise<{ succeeded: number; written: number }>,
  observer?: (result: WriteBehindResult) => void,
): Promise<void> {
  const startedAt = Date.now();
  let tally = { succeeded: 0, written: 0 };
  await bestEffort(scope, 'write-behind', null, async () => {
    tally = await persist();
  });
  const result: WriteBehindResult = {
    outcome: outcomeOf(tally.succeeded, attempted),
    attempted,
    written: tally.written,
    durationMs: Date.now() - startedAt,
  };
  await bestEffort(scope, 'write-behind observer', null, async () => observer?.(result));
}

function outcomeOf(succeeded: number, attempted: number): WriteBehindResult['outcome'] {
  if (succeeded >= attempted) return 'succeeded';
  return succeeded === 0 ? 'failed' : 'partial';
}
