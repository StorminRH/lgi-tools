import type { PersistVerdict } from './types';

export type ReadResult =
  | { kind: 'fresh' }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

const ROLE_REFUSED = 'esi_403';

/**
 * The verdict for a read ESI refused: a 403 means the credential lacks the
 * role (or the character the scope), so the engine tries the next member
 * and only then records `needs_role`; any other error is a skip under its
 * own code.
 */
export function errorVerdict<TSave>(code: string): PersistVerdict<TSave> {
  return code === ROLE_REFUSED ? { kind: 'needs_role' } : { kind: 'skip', code };
}

export function planRead<TRead extends ReadResult, TSave extends object>(
  read: TRead,
  onFresh: (fresh: Extract<TRead, { kind: 'fresh' }>) => TSave | null,
): PersistVerdict<TSave> {
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  if (read.kind === 'error') return errorVerdict(read.code);
  const payload = onFresh(read as Extract<TRead, { kind: 'fresh' }>);
  if (payload === null) return { kind: 'skip', code: 'contract_error' };
  return { ...payload, kind: 'save' };
}
