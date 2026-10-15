import { io } from 'next/cache';

/**
 * The current time for a Server Component, in epoch milliseconds. `io()`
 * suspends a prerender or a prefetch before the clock is read, so the time
 * never lands in a static shell and the read cannot fail the prerender
 * (blocking-prerender-current-time). Render the caller inside `<Suspense>`.
 */
export async function requestNow(): Promise<number> {
  await io();
  return Date.now();
}
