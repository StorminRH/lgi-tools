const MAX_TIMEOUT_SEARCH_NODES = 16;

/**
 * Whether a timeout abort sits anywhere in the error's wrap chain. Walks
 * `cause` and Neon's `sourceError` breadth-first over at most 16 nodes, so a
 * cyclic chain still ends, and matches any node named 'TimeoutError'.
 */
export function isTimeoutError(err: unknown): boolean {
  const pending: unknown[] = [err];
  for (let visited = 0; visited < MAX_TIMEOUT_SEARCH_NODES && visited < pending.length; visited++) {
    const node = pending[visited];
    if (node == null) continue;
    if ((node as { name?: unknown }).name === 'TimeoutError') return true;
    const { cause, sourceError } = node as { cause?: unknown; sourceError?: unknown };
    if (cause != null) pending.push(cause);
    if (sourceError != null) pending.push(sourceError);
  }
  return false;
}
