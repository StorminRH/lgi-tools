/** Accepts a task to run after the response, or returns false to make the caller run it now. */
export type WorkDeferrer = (task: () => Promise<void>) => boolean;

let deferrer: WorkDeferrer | null = null;

export function setWorkDeferrer(next: WorkDeferrer | null): void {
  deferrer = next;
}

/**
 * Runs `task` after the response when the host can extend the request
 * (Next's `after()`), and awaits it now everywhere else: Convex, scripts,
 * tests, or outside a request scope.
 */
export async function deferWork(task: () => Promise<void>): Promise<void> {
  if (deferrer?.(task) === true) return;
  await task();
}
