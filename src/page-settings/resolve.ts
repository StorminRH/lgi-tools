import type { PageSettingsSpec } from './types';

// Resolve the spec whose `route` best matches a concrete pathname (the value
// usePathname() returns — e.g. `/sites/30002`, not the `/sites/[id]` pattern). A
// spec matches when the pathname equals its route or sits under it as a path
// segment, so `/sites` governs `/sites/30002` but not `/sitesfoo` (the segment
// boundary the bare `startsWith` of isToolActive omits). The most-specific
// (longest) matching route wins, so a `/industry/build` spec overrides a
// `/industry` one. An empty pathname — the static shell before the client route
// streams in — matches nothing.
export function resolveSpecForPath(
  pathname: string,
  specs: readonly PageSettingsSpec[],
): PageSettingsSpec | null {
  if (!pathname) return null;
  let best: PageSettingsSpec | null = null;
  for (const spec of specs) {
    const { route } = spec;
    const matches = pathname === route || pathname.startsWith(`${route}/`);
    if (matches && (best === null || route.length > best.route.length)) {
      best = spec;
    }
  }
  return best;
}
