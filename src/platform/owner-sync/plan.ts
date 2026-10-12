import type { PersistVerdict } from './types';

export type ReadResult =
  | { kind: 'fresh' }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string; expiresAt?: number };

const ROLE_REFUSED = 'esi_403';

/**
 * The verdict for a read ESI refused: a 403 means the credential lacks the
 * role (or the character the scope), so the engine tries the next member
 * and only then records `needs_role`, until the 403's own Expires when it
 * sent one; any other error is a skip under its own code.
 */
export function errorVerdict<TSave>(code: string, expiresAt?: number): PersistVerdict<TSave> {
  if (code !== ROLE_REFUSED) return { kind: 'skip', code };
  return expiresAt === undefined ? { kind: 'needs_role' } : { kind: 'needs_role', expiresAt };
}

export function planRead<TRead extends ReadResult, TSave extends object>(
  read: TRead,
  onFresh: (fresh: Extract<TRead, { kind: 'fresh' }>) => TSave | null,
): PersistVerdict<TSave> {
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  if (read.kind === 'error') return errorVerdict(read.code, read.expiresAt);
  const payload = onFresh(read as Extract<TRead, { kind: 'fresh' }>);
  if (payload === null) return { kind: 'skip', code: 'contract_error' };
  return { ...payload, kind: 'save' };
}
