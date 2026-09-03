import type { PersistVerdict } from './types';

export type ReadResult =
  | { kind: 'fresh' }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export function planRead<TRead extends ReadResult, TSave extends object>(
  read: TRead,
  onFresh: (fresh: Extract<TRead, { kind: 'fresh' }>) => TSave | null,
  mapError?: (code: string) => PersistVerdict<TSave>,
): PersistVerdict<TSave> {
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  if (read.kind === 'error') return mapError?.(read.code) ?? { kind: 'skip', code: read.code };
  const payload = onFresh(read as Extract<TRead, { kind: 'fresh' }>);
  if (payload === null) return { kind: 'skip', code: 'contract_error' };
  return { ...payload, kind: 'save' };
}
