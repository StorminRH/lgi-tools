import type { PersistVerdict } from './types';

// The minimal conditional-read shape the planner branches on — the slice's own
// ReadResult union (single or paged) is structurally one of these.
type ReadResult =
  | { kind: 'fresh' }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The common single-fetch → verdict mapping. unchanged → stamp; error → skip
 * (unless mapError preserves a feature verdict, e.g. corp jobs' 403 → needs_role);
 * fresh → onFresh, where a null projection (contract mismatch) becomes skip and
 * otherwise saves the payload.
 */
export function planRead<TRead extends ReadResult, TSave extends object>(
  read: TRead,
  onFresh: (fresh: Extract<TRead, { kind: 'fresh' }>) => TSave | null,
  mapError?: (code: string) => PersistVerdict<TSave>,
): PersistVerdict<TSave> {
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  if (read.kind === 'error') return mapError?.(read.code) ?? { kind: 'skip', code: read.code };
  const payload = onFresh(read as Extract<TRead, { kind: 'fresh' }>);
  if (payload === null) return { kind: 'skip', code: 'contract_error' };
  // kind LAST so a payload that happens to carry its own `kind` can't clobber the
  // 'save' discriminant (no current slice does, but the engine is a reused primitive).
  return { ...payload, kind: 'save' };
}
