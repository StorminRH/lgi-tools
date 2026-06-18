import { unstable_rethrow } from 'next/navigation';

// Sentinel returned when a section's data load fails, so the caller renders a
// contained <SectionUnavailable/> instead of letting the throw reach the page's
// error boundary and 500 the whole dashboard. A `<Suspense>` boundary catches
// pending state, not errors — so without this, one failing admin query takes
// down every section.
export const SECTION_LOAD_FAILED = Symbol('admin.section-load-failed');

// Runs one admin section's request-time data load and returns its result, or the
// sentinel if the load throws. Two deliberate boundaries:
//   - Next.js control-flow signals propagate. Under Partial Prerendering a
//     request-time read throws a framework signal to bail the static shell into
//     its dynamic hole; redirect()/notFound() throw too. unstable_rethrow lets
//     those through — only genuine data failures degrade to the sentinel.
//   - JSX stays in the caller, outside this try. React renders elements later,
//     so a try around JSX can't catch a render-time throw anyway, and the
//     react-hooks/error-boundaries lint rule forbids constructing JSX in a try.
// The load callback is the query path (fetch only) — derivation and rendering
// run in the caller after the failure guard.
export async function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<T | typeof SECTION_LOAD_FAILED> {
  try {
    return await load();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[admin] ${label} section unavailable`, err);
    return SECTION_LOAD_FAILED;
  }
}
