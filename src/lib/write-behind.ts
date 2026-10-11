import { bestEffort } from './best-effort';

/** What one write-behind pass, run after the response, persisted. */
export interface WriteBehindResult {
  outcome: 'succeeded' | 'partial' | 'failed';
  attempted: number;
  written: number;
  durationMs: number;
}

/**
 * Hands `result` to the optional observer. An observer that throws is logged
 * as `[scope] write-behind observer failed` and never fails the write-behind.
 */
export function notifyObserver(
  observer: ((result: WriteBehindResult) => void) | undefined,
  result: WriteBehindResult,
  scope: string,
): Promise<void> {
  return bestEffort(scope, 'write-behind observer', null, async () => observer?.(result));
}
