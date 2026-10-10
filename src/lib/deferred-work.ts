/** Accepts a task to run after the response, or returns false to make the caller run it now. */
export type WorkDeferrer = (task: () => Promise<void>) => boolean;

/**
 * Next compiles instrumentation and route code as separate copies of this
 * module, so a module-level variable set in `register()` would never reach a
 * route. The deferrer lives on `globalThis`, which every copy shares.
 */
const slot = globalThis as typeof globalThis & { __lgiWorkDeferrer?: WorkDeferrer | null };

export function setWorkDeferrer(next: WorkDeferrer | null): void {
  slot.__lgiWorkDeferrer = next;
}

/**
 * Runs `task` after the response when the host can extend the request
 * (Next's `after()`), and awaits it now everywhere else: Convex, scripts,
 * tests, or outside a request scope.
 */
export async function deferWork(task: () => Promise<void>): Promise<void> {
  if (slot.__lgiWorkDeferrer?.(task) === true) return;
  await task();
}
