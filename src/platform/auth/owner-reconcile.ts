export type OwnerReconcileAction =

  | 'noop'

  | 'backfill'

  | 'purge';

export function classifyOwnerReconcile(
  storedHash: string | null,
  jwtOwnerHash: string | null | undefined,
): OwnerReconcileAction {
  if (!jwtOwnerHash) return 'noop';
  if (!storedHash) return 'backfill';
  return storedHash === jwtOwnerHash ? 'noop' : 'purge';
}
